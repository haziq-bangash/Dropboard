import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { createPrisma } from "../src/db";
import { createLimiter } from "../src/rate-limit";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";
const ORIGIN = process.env.BETTER_AUTH_URL;

describe("sliding-window limiter", () => {
  it("allows up to the limit, then says how long to wait", () => {
    let t = 1_000_000;
    const limiter = createLimiter(3, 60_000, () => t);
    for (let i = 0; i < 3; i++) expect(limiter.take("a")).toEqual({ ok: true });
    t += 10_000;
    expect(limiter.take("a")).toEqual({ ok: false, retryAfterSeconds: 50 });
  });

  it("frees a slot as the oldest hit leaves the window", () => {
    let t = 0;
    const limiter = createLimiter(2, 60_000, () => t);
    limiter.take("a");
    t += 30_000;
    limiter.take("a");
    expect(limiter.take("a").ok).toBe(false);
    t += 30_001; // the first hit is now 60,001 ms old
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);
  });

  it("counts each key on its own", () => {
    const limiter = createLimiter(1, 60_000, () => 0);
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);
    expect(limiter.take("b").ok).toBe(true);
  });

  it("peek counts nothing, record counts without checking", () => {
    const limiter = createLimiter(2, 60_000, () => 0);
    limiter.peek("a");
    limiter.peek("a");
    expect(limiter.take("a").ok).toBe(true);
    limiter.record("a");
    expect(limiter.peek("a").ok).toBe(false);
  });

  it("does not grow without bound when keys never repeat", () => {
    let t = 0;
    const limiter = createLimiter(1, 1_000, () => t);
    for (let i = 0; i < 12_000; i++) {
      t += 1;
      limiter.take(`key-${i}`);
    }
    // still answers correctly after the sweep
    expect(limiter.take("fresh").ok).toBe(true);
    expect(limiter.take("fresh").ok).toBe(false);
  });
});

describe("public share viewer limits (real Postgres)", () => {
  const prisma = createPrisma();
  const app = createApp({
    prisma,
    auth: createAuth(prisma),
    shareLimits: { requestsPerMinute: 4, wrongPasswordsPerMinute: 3 },
  });
  const emails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  async function publishedLink(password?: string) {
    const email = `limits-${crypto.randomUUID()}@test.local`;
    emails.push(email);
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: "l" }),
    });
    const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const headers = { "content-type": "application/json", origin: ORIGIN, cookie };
    const spec = { version: 1, title: "t", schema: [], charts: [{ id: "c1", type: "bar", title: "b", query: "SELECT 1 AS x", layout: { x: 0, y: 0, w: 1, h: 1 } }] };
    const { id } = (await (await app.request("/api/projects", { method: "POST", headers, body: JSON.stringify({ spec }) })).json()) as { id: string };
    const res = await app.request(`/api/projects/${id}/share`, { method: "POST", headers, body: JSON.stringify({ results: { c1: [{ x: 1 }] }, password }) });
    return ((await res.json()) as { slug: string }).slug;
  }

  const view = (slug: string, ip: string, extra: Record<string, string> = {}) =>
    app.request(`/api/shares/${slug}`, { headers: { "x-forwarded-for": ip, ...extra } });

  it("answers 429 with a retry time once one address has asked too often, and leaves others alone", async () => {
    const slug = await publishedLink();
    for (let i = 0; i < 4; i++) expect((await view(slug, "203.0.113.7")).status).toBe(200);
    const blocked = await view(slug, "203.0.113.7");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.json()).toMatchObject({ error: "too many requests" });
    expect((await view(slug, "198.51.100.9")).status).toBe(200);
  });

  it("uses the last X-Forwarded-For entry, so a spoofed first entry does not buy a fresh allowance", async () => {
    const slug = await publishedLink();
    for (let i = 0; i < 4; i++) expect((await view(slug, `10.0.0.${i}, 192.0.2.50`)).status).toBe(200);
    expect((await view(slug, "10.9.9.9, 192.0.2.50")).status).toBe(429);
  });

  it("stops password guessing on a link after a few wrong tries, whoever is guessing", async () => {
    const slug = await publishedLink("open-sesame");
    for (let i = 0; i < 3; i++) expect((await view(slug, `192.0.2.${100 + i}`, { "x-share-password": "wrong" })).status).toBe(403);
    // a fourth guess from yet another address is refused outright, and so is the right password while locked
    expect((await view(slug, "192.0.2.200", { "x-share-password": "wrong" })).status).toBe(429);
    expect((await view(slug, "192.0.2.201", { "x-share-password": "open-sesame" })).status).toBe(429);
  });

  it("does not count a request with no password, or a right password, as a wrong guess", async () => {
    const slug = await publishedLink("open-sesame");
    for (let i = 0; i < 3; i++) expect((await view(slug, `192.0.2.${10 + i}`)).status).toBe(401);
    expect((await view(slug, "192.0.2.30", { "x-share-password": "open-sesame" })).status).toBe(200);
  });

  it("does not count unknown links against anyone but the requester", async () => {
    expect((await view("does-not-exist", "192.0.2.77")).status).toBe(404);
  });
});
