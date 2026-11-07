import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type Deps } from "../src/app";
import { createAuth } from "../src/auth";
import { createPrisma } from "../src/db";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";

const ORIGIN = process.env.BETTER_AUTH_URL;
const spec = { version: 1, title: "t", schema: [], charts: [] };

describe("health", () => {
  it("serves /health without touching the database", async () => {
    const app = createApp({} as Deps);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("auth and dashboards (real Postgres)", () => {
  const prisma = createPrisma();
  const auth = createAuth(prisma);
  const app = createApp({ prisma, auth });
  const emails: string[] = [];

  async function signUp(label: string) {
    const email = `${label}-${crypto.randomUUID()}@test.local`;
    emails.push(email);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: label }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).toContain("session_token");
    return cookie;
  }

  const call = (path: string, cookie: string | null, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
        ...(init.headers as Record<string, string>),
      },
    });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it("rejects unauthenticated requests", async () => {
    expect((await call("/api/projects", null)).status).toBe(401);
    expect((await call("/api/projects", null, { method: "POST", body: JSON.stringify({ spec }) })).status).toBe(401);
  });

  it("rejects an invalid spec", async () => {
    const cookie = await signUp("invalid");
    expect((await call("/api/projects", cookie, { method: "POST", body: "{}" })).status).toBe(400);
  });

  it("creates, lists, reads and deletes a dashboard", async () => {
    const cookie = await signUp("owner");
    const created = await call("/api/projects", cookie, { method: "POST", body: JSON.stringify({ spec }) });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const list = ((await (await call("/api/projects", cookie)).json()) as { items: { id: string }[] }).items;
    expect(list.map((d) => d.id)).toContain(id);

    const got = await call(`/api/projects/${id}`, cookie);
    expect(got.status).toBe(200);
    expect(((await got.json()) as { spec: unknown }).spec).toEqual(spec);

    expect((await call(`/api/projects/${id}`, cookie, { method: "DELETE" })).status).toBe(204);
    expect((await call(`/api/projects/${id}`, cookie)).status).toBe(404);
  });

  it("does not let one user read or delete another user's dashboard", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const created = await call("/api/projects", alice, { method: "POST", body: JSON.stringify({ spec }) });
    const { id } = (await created.json()) as { id: string };

    expect((await call(`/api/projects/${id}`, bob)).status).toBe(404);
    expect((await call(`/api/projects/${id}`, bob, { method: "DELETE" })).status).toBe(404);
    expect((await call(`/api/projects/${id}`, alice)).status).toBe(200);
  });

  describe("publishing snapshots", () => {
    const chartSpec = {
      ...spec,
      charts: [{ id: "c1", type: "bar", title: "b", query: "SELECT 1 AS x", layout: { x: 0, y: 0, w: 1, h: 1 } }],
    };
    const results = { c1: [{ x: "a", y: 1 }] };

    async function makeDashboard(cookie: string) {
      const res = await call("/api/projects", cookie, { method: "POST", body: JSON.stringify({ spec: chartSpec }) });
      return ((await res.json()) as { id: string }).id;
    }
    const publish = (id: string, cookie: string | null, body: unknown) =>
      call(`/api/projects/${id}/share`, cookie, { method: "POST", body: JSON.stringify(body) });

    it("publishes a public snapshot readable without a session", async () => {
      const cookie = await signUp("pub");
      const id = await makeDashboard(cookie);
      const res = await publish(id, cookie, { results });
      expect(res.status).toBe(201);
      const { slug } = (await res.json()) as { slug: string };

      const view = await call(`/api/shares/${slug}`, null);
      expect(view.status).toBe(200);
      expect(view.headers.get("cache-control")).toContain("no-store");
      const body = (await view.json()) as { spec: { title: string }; results: unknown };
      expect(body.spec.title).toBe("t");
      expect(body.results).toEqual(results);
    });

    it("protects a share with a password", async () => {
      const cookie = await signUp("pw");
      const id = await makeDashboard(cookie);
      const { slug } = (await (await publish(id, cookie, { results, password: "open-sesame" })).json()) as { slug: string };

      const none = await call(`/api/shares/${slug}`, null);
      expect(none.status).toBe(401);
      expect(((await none.json()) as { passwordRequired: boolean }).passwordRequired).toBe(true);
      expect((await call(`/api/shares/${slug}`, null, { headers: { "x-share-password": "nope" } })).status).toBe(403);
      expect((await call(`/api/shares/${slug}`, null, { headers: { "x-share-password": "open-sesame" } })).status).toBe(200);
    });

    it("never stores the password in plain text", async () => {
      const cookie = await signUp("hash");
      const id = await makeDashboard(cookie);
      const { slug } = (await (await publish(id, cookie, { results, password: "plain-text-check" })).json()) as { slug: string };
      const row = await prisma.share.findUniqueOrThrow({ where: { slug } });
      expect(row.passwordHash).toBeTruthy();
      expect(row.passwordHash).not.toContain("plain-text-check");
    });

    it("lets the owner revoke, and only the owner", async () => {
      const owner = await signUp("rev-owner");
      const other = await signUp("rev-other");
      const id = await makeDashboard(owner);
      const { slug } = (await (await publish(id, owner, { results })).json()) as { slug: string };

      expect((await call(`/api/shares/${slug}`, other, { method: "DELETE" })).status).toBe(404);
      expect((await call(`/api/shares/${slug}`, null)).status).toBe(200);
      expect((await call(`/api/shares/${slug}`, owner, { method: "DELETE" })).status).toBe(204);
      expect((await call(`/api/shares/${slug}`, null)).status).toBe(404);
    });

    it("rejects publishing from non-owners, anonymous users, unknown charts and oversized snapshots", async () => {
      const owner = await signUp("rej-owner");
      const other = await signUp("rej-other");
      const id = await makeDashboard(owner);

      expect((await publish(id, null, { results })).status).toBe(401);
      expect((await publish(id, other, { results })).status).toBe(404);
      expect((await publish(id, owner, { results: { nope: [] } })).status).toBe(400);
      const big = { c1: Array(1000).fill({ x: "x".repeat(3000) }) };
      expect((await publish(id, owner, { results: big })).status).toBe(413);
    });

    it("returns 404 for unknown slugs", async () => {
      expect((await call("/api/shares/does-not-exist", null)).status).toBe(404);
    });
  });
});

describe("sign-in providers", () => {
  it("offers Google only when the OAuth client is configured", async () => {
    const app = createApp({} as Deps);
    const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
    try {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(await (await app.request("/api/providers")).json()).toEqual({ google: false, email: false });
      process.env.GOOGLE_CLIENT_ID = "id";
      process.env.GOOGLE_CLIENT_SECRET = "secret";
      expect(await (await app.request("/api/providers")).json()).toEqual({ google: true, email: false });
    } finally {
      if (saved.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = saved.id;
      if (saved.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = saved.secret;
    }
  });
});
