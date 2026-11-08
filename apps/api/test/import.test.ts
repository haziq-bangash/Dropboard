import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { createPrisma } from "../src/db";
import { checkUrl, fetchPublic, ImportError, isPublicAddress, nameFor, sheetsCsvUrl, type Address, type RawResponse } from "../src/import/public-fetch";

vi.setConfig({ testTimeout: 60_000 });
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";

const PUBLIC: Address[] = [{ address: "93.184.216.34", family: 4 }];
const csv = (body = "a,b\n1,2\n3,4\n", extra: Record<string, string> = {}): RawResponse => ({ status: 200, headers: { "content-type": "text/csv", ...extra }, body: Buffer.from(body) });
const codeOf = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as ImportError | null;

describe("which addresses count as public", () => {
  it("refuses everything private, local, shared or reserved, in IPv4", () => {
    for (const ip of ["127.0.0.1", "127.1.2.3", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.255.255", "0.0.0.0", "192.0.2.1", "198.18.0.1", "198.19.255.255", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it("accepts ordinary public IPv4 addresses, including those next to private ranges", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "192.167.1.1", "169.253.1.1", "11.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });
  it("refuses private and special IPv6, and IPv4 hidden inside IPv6", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:169.254.169.254", "64:ff9b::7f00:1", "2001:db8::1", "2001::1", "2002:7f00:1::1", "100::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
  it("accepts public IPv6, and IPv4 inside IPv6 when that IPv4 is public", () => {
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "2a00:1450:4001:81b::200e"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });
  it("says no to anything that is not an address", () => {
    for (const ip of ["", "example.com", "999.1.1.1", "1.2.3", "not-an-ip"]) expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("which web addresses are accepted", () => {
  const message = (raw: string) => {
    try {
      checkUrl(raw);
      return null;
    } catch (e) {
      return e as ImportError;
    }
  };
  it("accepts an ordinary https address", () => {
    expect(checkUrl("https://example.com/data.csv").href).toBe("https://example.com/data.csv");
    expect(checkUrl("  https://example.com:443/x?y=1  ").port).toBe("");
  });
  it("refuses other schemes, and plain http", () => {
    for (const raw of ["http://example.com/a.csv", "ftp://example.com/a.csv", "file:///etc/passwd", "gopher://example.com", "javascript:alert(1)", "data:text/csv,a,b"]) {
      expect(message(raw)?.code, raw).toBe("invalid_url");
    }
  });
  it("refuses addresses with a name and password in them, and other ports", () => {
    expect(message("https://user:pass@example.com/a.csv")?.code).toBe("blocked");
    expect(message("https://example.com:8443/a.csv")?.code).toBe("blocked");
    expect(message("https://example.com:22/")?.code).toBe("blocked");
  });
  it("refuses addresses that point inside, however they are written", () => {
    for (const raw of [
      "https://127.0.0.1/", "https://localhost/", "https://app.localhost/", "https://10.0.0.1/", "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fd00::1]/", "https://intranet/", "https://printer.local/", "https://db.internal/",
      "https://2130706433/", "https://0x7f000001/", "https://017700000001/", "https://127.1/", "https://0/",
    ]) {
      expect(message(raw)?.code, raw).toBe("blocked");
    }
  });
  it("refuses nonsense and over-long addresses", () => {
    expect(message("not a url")?.code).toBe("invalid_url");
    expect(message("")?.code).toBe("invalid_url");
    expect(message(`https://example.com/${"a".repeat(2100)}`)?.code).toBe("invalid_url");
  });
});

describe("Google Sheets links", () => {
  it("turn a share link into the CSV address, keeping the tab", () => {
    expect(sheetsCsvUrl("https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit?usp=sharing")).toBe("https://docs.google.com/spreadsheets/d/1AbC_dEf-123/export?format=csv");
    expect(sheetsCsvUrl("https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit#gid=987654")).toBe("https://docs.google.com/spreadsheets/d/1AbC_dEf-123/export?format=csv&gid=987654");
    expect(sheetsCsvUrl("https://docs.google.com/spreadsheets/d/1AbC_dEf-123/edit?gid=42#gid=42")).toBe("https://docs.google.com/spreadsheets/d/1AbC_dEf-123/export?format=csv&gid=42");
  });
  it("turn a published link into its CSV address", () => {
    expect(sheetsCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-1vABC_def/pubhtml")).toBe("https://docs.google.com/spreadsheets/d/e/2PACX-1vABC_def/pub?output=csv");
    expect(sheetsCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-1vABC_def/pub?gid=5&single=true&output=html")).toBe("https://docs.google.com/spreadsheets/d/e/2PACX-1vABC_def/pub?output=csv&gid=5");
  });
  it("leave every other address alone", () => {
    for (const raw of ["https://example.com/a.csv", "https://docs.google.com/document/d/abc/edit", "https://docs.google.com.evil.example/spreadsheets/d/abc/edit", "not a url"]) {
      expect(sheetsCsvUrl(raw), raw).toBe(raw);
    }
  });
});

describe("fetching, scripted", () => {
  const options = (send: (url: URL) => RawResponse, extra = {}) => ({ resolve: async () => PUBLIC, send: async (url: URL) => send(url), ...extra });

  it("returns the file with a name, a type and the final address", async () => {
    const got = await fetchPublic("https://example.com/sales.csv", options(() => csv()));
    expect(got.body.toString()).toBe("a,b\n1,2\n3,4\n");
    expect(got.contentType).toBe("text/csv");
    expect(got.filename).toBe("sales.csv");
    expect(got.finalUrl).toBe("https://example.com/sales.csv");
  });

  it("names a file from the server's suggestion, including spaces and non-English letters", async () => {
    const a = await fetchPublic("https://example.com/export", options(() => csv("a\n1\n", { "content-disposition": `attachment; filename*=UTF-8''Support%20tickets%20-%20Q4.csv` })));
    expect(a.filename).toBe("Support tickets - Q4.csv");
    const b = await fetchPublic("https://example.com/export", options(() => csv("a\n1\n", { "content-disposition": 'attachment; filename="../../etc/passwd"' })));
    expect(b.filename).not.toContain("/");
    const c = await fetchPublic("https://example.com/export", options(() => csv()));
    expect(c.filename).toBe("Imported data.csv");
    expect(nameFor(new URL("https://x.test/a/report"), "", "json")).toBe("report.json");
  });

  it("follows a redirect to another public address, vetting it", async () => {
    const seen: string[] = [];
    const got = await fetchPublic("https://example.com/a", options((url) => {
      seen.push(url.href);
      return url.pathname === "/a" ? { status: 302, headers: { location: "/b.csv" }, body: Buffer.alloc(0) } : csv();
    }));
    expect(seen).toEqual(["https://example.com/a", "https://example.com/b.csv"]);
    expect(got.filename).toBe("b.csv");
  });

  it("refuses a redirect to a private address, to http, to a new port, or one that loops", async () => {
    const redirect = (location: string) => options(() => ({ status: 302, headers: { location }, body: Buffer.alloc(0) }));
    expect((await codeOf(fetchPublic("https://example.com/a", redirect("https://169.254.169.254/latest/meta-data/"))))?.code).toBe("blocked");
    expect((await codeOf(fetchPublic("https://example.com/a", redirect("https://localhost/x"))))?.code).toBe("blocked");
    expect((await codeOf(fetchPublic("https://example.com/a", redirect("http://example.com/x"))))?.code).toBe("invalid_url");
    expect((await codeOf(fetchPublic("https://example.com/a", redirect("https://example.com:8443/x"))))?.code).toBe("blocked");
    expect((await codeOf(fetchPublic("https://example.com/a", redirect("/a"))))?.message).toMatch(/too many times/);
  });

  it("refuses a name that resolves to a private address, even when it also resolves to a public one", async () => {
    const mixed = { resolve: async () => [...PUBLIC, { address: "10.0.0.7", family: 4 as const }], send: async () => csv() };
    expect((await codeOf(fetchPublic("https://example.com/a.csv", mixed)))?.code).toBe("blocked");
    const inside = { resolve: async () => [{ address: "127.0.0.1", family: 4 as const }], send: async () => csv() };
    expect((await codeOf(fetchPublic("https://example.com/a.csv", inside)))?.code).toBe("blocked");
  });

  it("connects to the address it checked, so a name that answers differently later changes nothing", async () => {
    const resolve = vi.fn(async () => PUBLIC);
    const connected: string[] = [];
    await fetchPublic("https://example.com/a.csv", { resolve, send: async (_u, address) => (connected.push(address.address), csv()) });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(connected).toEqual(["93.184.216.34"]);
  });

  it("says plainly what is wrong with a response", async () => {
    const page = (host: string, path: string) => options(() => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from("<html>") }));
    expect((await codeOf(fetchPublic("https://example.com/a", page("example.com", "/a"))))?.code).toBe("not_data");
    expect((await codeOf(fetchPublic("https://docs.google.com/spreadsheets/d/abc/export?format=csv", page("docs.google.com", "/"))))?.code).toBe("not_shared");
    expect((await codeOf(fetchPublic("https://example.com/a", options(() => ({ status: 404, headers: {}, body: Buffer.alloc(0) })))))?.message).toMatch(/Nothing was found/);
    expect((await codeOf(fetchPublic("https://example.com/a", options(() => ({ status: 500, headers: {}, body: Buffer.alloc(0) })))))?.code).toBe("failed");
    expect((await codeOf(fetchPublic("https://example.com/a", options(() => ({ status: 200, headers: { "content-type": "image/png" }, body: Buffer.from("x") })))))?.code).toBe("not_data");
    expect((await codeOf(fetchPublic("https://example.com/a", options(() => ({ status: 200, headers: { "content-type": "text/csv" }, body: Buffer.alloc(0) })))))?.code).toBe("not_data");
    expect((await codeOf(fetchPublic("https://example.com/a", options(() => csv("a\n1\n", { "content-encoding": "gzip" })))))?.code).toBe("failed");
    const unresolved = { resolve: async () => { throw new Error("ENOTFOUND"); }, send: async () => csv() };
    expect((await codeOf(fetchPublic("https://nothing.example/a", unresolved)))?.message).toMatch(/could not be found/);
  });

  it("reads the kinds of file Dropboard understands", async () => {
    for (const [type, name] of [["text/csv", "csv"], ["text/tab-separated-values", "tsv"], ["application/json", "json"], ["application/x-ndjson", "ndjson"], ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"], ["text/plain", "csv"]] as const) {
      const got = await fetchPublic("https://example.com/file", options(() => ({ status: 200, headers: { "content-type": `${type}; charset=utf-8` }, body: Buffer.from("x") })));
      expect(got.filename.endsWith(`.${name}`), type).toBe(true);
    }
  });
});

describe("fetching over a real connection", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/ok.csv") res.writeHead(200, { "content-type": "text/csv" }).end("a,b\n1,2\n");
      else if (req.url === "/big") {
        res.writeHead(200, { "content-type": "text/csv" });
        const timer = setInterval(() => res.write("x".repeat(10_000) + "\n"), 1);
        res.on("close", () => clearInterval(timer));
      } else if (req.url === "/declared") res.writeHead(200, { "content-type": "text/csv", "content-length": String(50 * 1024 * 1024) }).end("a,b\n");
      else if (req.url === "/slow") {
        /* never answers */
      } else if (req.url === "/to-ok") res.writeHead(302, { location: "/ok.csv" }).end();
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))));

  // these tests turn the address checks off (never done in production) so a server on this machine can be reached
  const local = { allowPrivate: true };
  it("fetches a file, and follows a redirect", async () => {
    expect((await fetchPublic(`${base}/ok.csv`, local)).body.toString()).toBe("a,b\n1,2\n");
    expect((await fetchPublic(`${base}/to-ok`, local)).filename).toBe("ok.csv");
  });
  it("stops a file that grows past the limit, and one that says it is too big before sending", async () => {
    expect((await codeOf(fetchPublic(`${base}/big`, { ...local, maxBytes: 100_000 })))?.code).toBe("too_large");
    expect((await codeOf(fetchPublic(`${base}/declared`, local)))?.code).toBe("too_large");
  });
  it("gives up on a server that never answers", async () => {
    const started = Date.now();
    expect((await codeOf(fetchPublic(`${base}/slow`, { ...local, timeoutMs: 500 })))?.code).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(5000);
  });
  it("refuses the same local server when the checks are on", async () => {
    expect((await codeOf(fetchPublic(`${base}/ok.csv`)))?.code).toBe("invalid_url"); // http, and a private address
  });
});

describe("the import route (real Postgres)", () => {
  const prisma = createPrisma();
  const calls: string[] = [];
  const app = createApp({
    prisma,
    auth: createAuth(prisma),
    importFetch: async (url) => {
      calls.push(url);
      if (url.includes("private")) throw new ImportError("not_shared", "That sheet is not shared.", 422);
      return { body: Buffer.from("a,b\n1,2\n"), contentType: "text/csv", filename: "Support tickets.csv", finalUrl: url };
    },
  });
  const emails: string[] = [];
  const ORIGIN = process.env.BETTER_AUTH_URL!;
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });
  async function cookie() {
    const email = `import-${crypto.randomUUID()}@test.local`;
    emails.push(email);
    const res = await app.request("/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email, password: "correct-horse-battery", name: "import" }) });
    return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  }
  const post = (session: string | null, url: string) =>
    app.request("/api/import/fetch", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...(session ? { cookie: session } : {}) }, body: JSON.stringify({ url }) });

  it("needs a signed-in person", async () => {
    expect((await post(null, "https://example.com/a.csv")).status).toBe(401);
    expect(calls).toEqual([]);
  });
  it("passes the file on with its name, and does not let it be cached", async () => {
    const res = await post(await cookie(), "https://example.com/a.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(decodeURIComponent(res.headers.get("x-import-filename")!)).toBe("Support tickets.csv");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("a,b\n1,2\n");
  });
  it("turns a Google Sheets link into its CSV address before fetching", async () => {
    calls.length = 0;
    await post(await cookie(), "https://docs.google.com/spreadsheets/d/1AbC/edit#gid=7");
    expect(calls).toEqual(["https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=7"]);
  });
  it("reports a problem as a message and the right status", async () => {
    const res = await post(await cookie(), "https://example.com/private");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "That sheet is not shared.", code: "not_shared" });
    expect((await post(await cookie(), "short")).status).toBe(400);
  });
  it("limits how often one person can import", async () => {
    const session = await cookie();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post(session, "https://example.com/a.csv")).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    const limited = await post(session, "https://example.com/a.csv");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
