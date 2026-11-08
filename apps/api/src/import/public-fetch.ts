import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

/**
 * Fetching a file from an address a person typed, on their behalf, without letting that address reach anything of ours.
 *
 * Fetching on a stranger's behalf is how a server gets turned against its own network: an address like http://169.254.169.254
 * (the cloud's metadata service) or http://10.0.0.5 would be fetched from inside, with the server's own reach. So every step is
 * checked: only https and port 443, no credentials in the address, a name that resolves, EVERY address it resolves to must be a
 * public one, the connection is made to the address that was checked (not looked up a second time, which would let a name answer
 * differently the second time), a redirect is followed only through the same checks, and the size, the time, the kind of file and
 * the encoding are all limited.
 */

export type ImportCode = "invalid_url" | "blocked" | "not_shared" | "not_data" | "too_large" | "timeout" | "failed";

export class ImportError extends Error {
  constructor(
    readonly code: ImportCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Address {
  address: string;
  family: 4 | 6;
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface FetchOptions {
  /** Most bytes accepted. Default 25 MB. */
  maxBytes?: number;
  /** Longest the whole fetch may take. Default 20 seconds. */
  timeoutMs?: number;
  /** Most redirects followed. Default 4. */
  maxRedirects?: number;
  /** FOR TESTS ONLY: allow private addresses, plain http and any port. Production never sets this. */
  allowPrivate?: boolean;
  /** How names are resolved. Replaced in tests. */
  resolve?: (host: string) => Promise<Address[]>;
  /** How one request is made. Replaced in tests. */
  send?: (url: URL, address: Address, limits: { maxBytes: number; timeoutMs: number }) => Promise<RawResponse>;
}

export interface Fetched {
  body: Buffer;
  contentType: string;
  filename: string;
  finalUrl: string;
}

export const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 4;

// ---- which addresses are public ----

const v4Public = ([a, b, c]: number[]) =>
  !(
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // shared address space (carrier-grade NAT)
    (a === 169 && b === 254) || // link-local, including the cloud metadata service
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && c === 0) || // protocol assignments
    (a === 192 && b === 0 && c === 2) || // documentation
    (a === 192 && b === 88 && c === 99) || // 6to4 relay
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast, reserved, broadcast
  );

/** The eight 16-bit groups of an IPv6 address, with "::" expanded and an IPv4 tail turned into two groups. */
function groups(ip: string): number[] {
  let text = ip.split("%")[0].toLowerCase();
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail[1].split(".").map(Number);
    text = text.slice(0, -tail[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = rest === undefined ? [] : rest ? rest.split(":") : [];
  const fill = rest === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((g) => parseInt(g || "0", 16));
}

const v6Public = (ip: string): boolean => {
  const g = groups(ip);
  if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return false;
  const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
  // an IPv4 address inside an IPv6 one (mapped, or through NAT64) is judged as the IPv4 address it holds
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Public(embedded);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4Public(embedded);
  // only global unicast (2000::/3) can be public; and within it, not the ranges set aside for documentation or tunnels
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0 || (g[1] & 0xfff0) === 0x0010)) return false; // documentation, Teredo, ORCHID
  if (g[0] === 0x2002) return false; // 6to4: can hold any IPv4 address
  if (g[0] === 0x3fff && (g[1] & 0xf000) === 0) return false; // documentation
  return true;
};

/** Is this a public, routable address a server may connect to for a stranger? */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Public(ip.split(".").map(Number));
  if (kind === 6) return v6Public(ip);
  return false;
}

// ---- which addresses (web addresses) may be fetched ----

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|lan|home\.arpa|intranet|corp|private)$/;

/** Parse and vet an address a person typed. Throws an ImportError saying what is wrong, in words they can act on. */
export function checkUrl(raw: string, options: Pick<FetchOptions, "allowPrivate"> = {}): URL {
  const bad = (message: string, code: ImportCode = "invalid_url") => new ImportError(code, message, 400);
  if (typeof raw !== "string" || raw.length > 2000) throw bad("That address is not valid.");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw bad("That does not look like a web address. It should start with https://");
  }
  const testing = options.allowPrivate === true;
  if (url.protocol !== "https:" && !(testing && url.protocol === "http:")) throw bad("Only https:// addresses can be imported.");
  if (url.username || url.password) throw bad("Addresses with a name or password in them are not allowed.", "blocked");
  if (!testing && url.port && url.port !== "443") throw bad("Only the standard https port is allowed.", "blocked");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) throw bad("That address has no host name.");
  if (!testing) {
    const literal = isIP(host);
    if (literal && !isPublicAddress(host)) throw bad("That address points inside a private network, so it cannot be fetched.", "blocked");
    if (!literal && (BLOCKED_NAMES.test(host) || !host.includes("."))) throw bad("That address points inside a private network, so it cannot be fetched.", "blocked");
  }
  return url;
}

async function resolveHost(host: string): Promise<Address[]> {
  const found = await lookup(host, { all: true, verbatim: true });
  return found.map((f) => ({ address: f.address, family: f.family === 6 ? 6 : 4 }));
}

/** One request to an address that has already been checked, with the connection pinned to it. */
function sendRequest(url: URL, address: Address, limits: { maxBytes: number; timeoutMs: number }): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === "https:";
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const make = secure ? httpsRequest : httpRequest;
    const req = make(
      {
        host,
        port: url.port ? Number(url.port) : secure ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: isIP(host) ? undefined : host,
        // the name is never looked up again: the connection goes to the address that was checked
        lookup: (_name, options, callback) => {
          if ((options as { all?: boolean }).all) (callback as unknown as (e: null, a: Address[]) => void)(null, [address]);
          else callback(null, address.address, address.family);
        },
        headers: {
          "user-agent": "Dropboard-Import/1.0 (+https://dropboard.de)",
          accept: "text/csv, text/tab-separated-values, application/json, application/x-ndjson, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/plain;q=0.8, */*;q=0.1",
          // a compressed answer could unpack to far more than it weighs
          "accept-encoding": "identity",
        },
      },
      (res) => {
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > limits.maxBytes) {
          res.destroy();
          reject(new ImportError("too_large", "That file is too large to import (the limit is 25 MB).", 413));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limits.maxBytes) {
            res.destroy();
            reject(new ImportError("too_large", "That file is too large to import (the limit is 25 MB).", 413));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", () => reject(new ImportError("failed", "The connection broke while the file was coming in.", 502)));
      },
    );
    req.setTimeout(limits.timeoutMs, () => req.destroy(new ImportError("timeout", "That address took too long to answer.", 504)));
    req.on("error", (e) => reject(e instanceof ImportError ? e : new ImportError("failed", "Could not connect to that address.", 502)));
    req.end();
  });
}

// ---- reading what came back ----

const KINDS: [RegExp, string][] = [
  [/^text\/csv|^application\/csv|^application\/vnd\.ms-excel/, "csv"],
  [/^text\/tab-separated-values/, "tsv"],
  [/^application\/(x-)?ndjson|^application\/jsonl|^application\/x-jsonlines/, "ndjson"],
  [/^application\/(.+\+)?json/, "json"],
  [/^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/, "xlsx"],
  // plain text and unlabelled bytes are tried as a table: the browser's reader decides
  [/^text\/plain|^application\/octet-stream|^binary\/octet-stream/, "csv"],
];

const header = (r: RawResponse, name: string) => {
  const v = r.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

/** The file name the server suggests, else the end of the address, with a fitting ending. */
export function nameFor(finalUrl: URL, contentDisposition: string, kind: string): string {
  let name = "";
  const star = contentDisposition.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  const plain = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/);
  try {
    if (star) name = decodeURIComponent(star[1]);
    else if (plain) name = plain[1];
  } catch {
    name = plain?.[1] ?? "";
  }
  if (!name) {
    try {
      name = decodeURIComponent(finalUrl.pathname.split("/").filter(Boolean).pop() ?? "");
    } catch {
      name = "";
    }
  }
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  // an address like /export or /d/abc123 says nothing about the file: use a plain name
  if (!name || /^(export|download|pub|data|edit|gviz|tq)$/i.test(name)) name = "Imported data";
  return /\.(csv|tsv|json|ndjson|jsonl|xlsx)$/i.test(name) ? name : `${name}.${kind}`;
}

/**
 * Fetch a file from a public address. Throws an ImportError with a message a person can act on.
 * `Sheets` pages that ask for a sign-in come back as an HTML page, which is reported as a sheet that is not shared.
 */
export async function fetchPublic(raw: string, options: FetchOptions = {}): Promise<Fetched> {
  const limits = { maxBytes: options.maxBytes ?? MAX_BYTES, timeoutMs: options.timeoutMs ?? TIMEOUT_MS };
  const resolve = options.resolve ?? resolveHost;
  const send = options.send ?? sendRequest;
  const testing = options.allowPrivate === true;
  const deadline = Date.now() + limits.timeoutMs;
  let url = checkUrl(raw, options);

  for (let hop = 0; hop <= (options.maxRedirects ?? MAX_REDIRECTS); hop++) {
    // every hop is vetted afresh: a redirect to a private address is exactly the trick this stops
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let addresses: Address[];
    if (isIP(host)) addresses = [{ address: host, family: isIP(host) === 6 ? 6 : 4 }];
    else {
      try {
        addresses = await resolve(host);
      } catch {
        throw new ImportError("failed", "That address could not be found.", 502);
      }
    }
    if (!addresses.length) throw new ImportError("failed", "That address could not be found.", 502);
    // every answer must be public: a name that also points inside is refused, not trusted to pick the right one
    if (!testing && addresses.some((a) => !isPublicAddress(a.address))) {
      throw new ImportError("blocked", "That address points inside a private network, so it cannot be fetched.", 400);
    }
    const left = deadline - Date.now();
    if (left <= 0) throw new ImportError("timeout", "That address took too long to answer.", 504);
    const response = await send(url, addresses[0], { maxBytes: limits.maxBytes, timeoutMs: Math.min(limits.timeoutMs, left) });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = header(response, "location");
      if (!location) throw new ImportError("failed", "That address redirected nowhere.", 502);
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new ImportError("failed", "That address redirected somewhere invalid.", 502);
      }
      url = checkUrl(next.href, options);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ImportError("failed", response.status === 404 ? "Nothing was found at that address." : `That address answered with an error (${response.status}).`, 502);
    }

    const encoding = header(response, "content-encoding").toLowerCase();
    if (encoding && encoding !== "identity") throw new ImportError("failed", "That server sent the file compressed in a way that cannot be read.", 502);
    const type = header(response, "content-type").split(";")[0].trim().toLowerCase();
    const finalHost = url.hostname.toLowerCase();
    if (type === "text/html" || type === "application/xhtml+xml") {
      // a sheet that is not shared sends the visitor to a sign-in page
      if (finalHost === "accounts.google.com" || (finalHost === "docs.google.com" && url.pathname.startsWith("/spreadsheets"))) {
        throw new ImportError("not_shared", "That sheet is not shared. In Google Sheets choose Share, then 'Anyone with the link' as a viewer, or File, Share, Publish to the web.", 422);
      }
      throw new ImportError("not_data", "That address is a web page, not a data file. Use a link straight to a CSV or JSON file.", 422);
    }
    const kind = KINDS.find(([pattern]) => pattern.test(type))?.[1];
    if (!kind) throw new ImportError("not_data", `That address returns a ${type || "file"} that Dropboard cannot read. It reads CSV, TSV, JSON, NDJSON and Excel files.`, 422);
    if (!response.body.length) throw new ImportError("not_data", "That address returned an empty file.", 422);
    return { body: response.body, contentType: type, filename: nameFor(url, header(response, "content-disposition"), kind), finalUrl: url.href };
  }
  throw new ImportError("failed", "That address redirected too many times.", 502);
}

// ---- Google Sheets ----

/**
 * A Google Sheets link, turned into the address that gives its data as CSV. A normal share link (with gid in the address for a
 * particular tab) and a "published to the web" link both work; anything else is returned unchanged.
 */
export function sheetsCsvUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw;
  }
  if (url.hostname !== "docs.google.com") return raw;
  const gid = url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1];
  const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\//);
  if (published) {
    const out = new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub`);
    out.searchParams.set("output", "csv");
    if (gid) out.searchParams.set("gid", gid);
    return out.href;
  }
  const normal = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!normal) return raw;
  const out = new URL(`https://docs.google.com/spreadsheets/d/${normal[1]}/export`);
  out.searchParams.set("format", "csv");
  if (gid) out.searchParams.set("gid", gid);
  return out.href;
}
