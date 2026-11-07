// Same-origin proxy to the Hono API, so session cookies stay first-party.
// Reads API_URL at request time (not build time), so one image works in every environment.
import { clientAddressHeaders } from "@/lib/forward";

export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
]);

async function proxy(req: Request): Promise<Response> {
  const base = process.env.API_URL ?? "http://localhost:8080";
  const url = new URL(req.url);
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    // never pass on a visitor's own claim about who they are: the API only trusts what we set below
    if (!HOP_BY_HOP.has(name) && !name.startsWith("x-dropboard-"))
      headers.set(key, value);
  });
  for (const [name, value] of Object.entries(clientAddressHeaders(req.headers)))
    headers.set(name, value);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(`${base}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error: required by Node's fetch when streaming a request body
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
    });
  } catch {
    return Response.json({ error: "api unavailable" }, { status: 502 });
  }

  const out = new Headers(upstream.headers);
  // fetch() already decoded the body
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
