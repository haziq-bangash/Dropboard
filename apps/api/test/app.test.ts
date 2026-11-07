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
    expect((await call("/api/dashboards", null)).status).toBe(401);
    expect((await call("/api/dashboards", null, { method: "POST", body: JSON.stringify(spec) })).status).toBe(401);
  });

  it("rejects an invalid spec", async () => {
    const cookie = await signUp("invalid");
    expect((await call("/api/dashboards", cookie, { method: "POST", body: "{}" })).status).toBe(400);
  });

  it("creates, lists, reads and deletes a dashboard", async () => {
    const cookie = await signUp("owner");
    const created = await call("/api/dashboards", cookie, { method: "POST", body: JSON.stringify(spec) });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const list = (await (await call("/api/dashboards", cookie)).json()) as { id: string }[];
    expect(list.map((d) => d.id)).toContain(id);

    const got = await call(`/api/dashboards/${id}`, cookie);
    expect(got.status).toBe(200);
    expect(((await got.json()) as { spec: unknown }).spec).toEqual(spec);

    expect((await call(`/api/dashboards/${id}`, cookie, { method: "DELETE" })).status).toBe(204);
    expect((await call(`/api/dashboards/${id}`, cookie)).status).toBe(404);
  });

  it("does not let one user read or delete another user's dashboard", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const created = await call("/api/dashboards", alice, { method: "POST", body: JSON.stringify(spec) });
    const { id } = (await created.json()) as { id: string };

    expect((await call(`/api/dashboards/${id}`, bob)).status).toBe(404);
    expect((await call(`/api/dashboards/${id}`, bob, { method: "DELETE" })).status).toBe(404);
    expect((await call(`/api/dashboards/${id}`, alice)).status).toBe(200);
  });
});
