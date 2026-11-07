import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { createPrisma } from "../src/db";
import { FREE } from "../src/plans";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";
const ORIGIN = process.env.BETTER_AUTH_URL;

const chart = { id: "c1", type: "bar", title: "b", query: "SELECT 1 AS x", layout: { x: 0, y: 0, w: 1, h: 1 } };
const spec = (title = "Sales") => ({ version: 1, title, schema: [{ name: "x", type: "number" }], charts: [chart] });

describe("projects (real Postgres)", () => {
  const prisma = createPrisma();
  // tiny limits so the caps are quick to reach
  const app = createApp({ prisma, auth: createAuth(prisma), limitsFor: async () => ({ ...FREE, projects: 2, publishedLinks: 1 }) });
  const emails: string[] = [];

  async function signUp(label: string) {
    const email = `${label}-${crypto.randomUUID()}@test.local`;
    emails.push(email);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password: "correct-horse-battery", name: label }),
    });
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  const call = (path: string, cookie: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { "content-type": "application/json", origin: ORIGIN, cookie } });
  const create = (cookie: string, body: unknown = { spec: spec() }) => call("/api/projects", cookie, { method: "POST", body: JSON.stringify(body) });
  const read = async (cookie: string, id: string) => (await call(`/api/projects/${id}`, cookie)).json() as Promise<Record<string, any>>;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it("remembers which file a project came from, without storing any rows", async () => {
    const cookie = await signUp("source");
    const res = await create(cookie, { spec: spec(), source: { fileName: "sales.csv", rowCount: 1200 } });
    const { id } = (await res.json()) as { id: string };
    const list = (await (await call("/api/projects", cookie)).json()) as { items: Record<string, unknown>[] };
    expect(list.items[0]).toMatchObject({ id, title: "Sales", sourceName: "sales.csv", rowCount: 1200, charts: 1, published: false });
    expect(list.items[0]).not.toHaveProperty("spec");
  });

  it("renames a project and keeps the title inside the spec in step", async () => {
    const cookie = await signUp("rename");
    const { id } = (await (await create(cookie)).json()) as { id: string };
    expect((await call(`/api/projects/${id}`, cookie, { method: "PATCH", body: JSON.stringify({ title: "Q4 sales" }) })).status).toBe(200);
    const p = await read(cookie, id);
    expect(p.title).toBe("Q4 sales");
    expect(p.spec.title).toBe("Q4 sales");
    expect(p.spec.charts).toHaveLength(1);
  });

  it("updates the spec, and rejects an empty or invalid update", async () => {
    const cookie = await signUp("update");
    const { id } = (await (await create(cookie)).json()) as { id: string };
    const next = { ...spec("Renamed"), charts: [] };
    expect((await call(`/api/projects/${id}`, cookie, { method: "PATCH", body: JSON.stringify({ spec: next }) })).status).toBe(200);
    expect((await read(cookie, id)).spec.charts).toEqual([]);
    expect((await call(`/api/projects/${id}`, cookie, { method: "PATCH", body: JSON.stringify({}) })).status).toBe(400);
    expect((await call(`/api/projects/${id}`, cookie, { method: "PATCH", body: JSON.stringify({ title: "" }) })).status).toBe(400);
  });

  it("duplicates a project with a copy title", async () => {
    const cookie = await signUp("dup");
    const { id } = (await (await create(cookie, { spec: spec("Sales"), source: { fileName: "s.csv", rowCount: 5 } })).json()) as { id: string };
    const res = await call(`/api/projects/${id}/duplicate`, cookie, { method: "POST" });
    expect(res.status).toBe(201);
    const copy = (await res.json()) as { id: string; title: string };
    expect(copy.title).toBe("Sales (copy)");
    expect(copy.id).not.toBe(id);
    expect((await read(cookie, copy.id)).sourceName).toBe("s.csv");
  });

  it("stops at the plan's project limit, for create and duplicate, and frees a slot on delete", async () => {
    const cookie = await signUp("cap");
    const first = (await (await create(cookie)).json()) as { id: string };
    expect((await create(cookie)).status).toBe(201);

    const blocked = await create(cookie);
    expect(blocked.status).toBe(402);
    expect(await blocked.json()).toMatchObject({ code: "limit_reached", limit: 2 });
    expect((await call(`/api/projects/${first.id}/duplicate`, cookie, { method: "POST" })).status).toBe(402);

    const list = (await (await call("/api/projects", cookie)).json()) as { limits: { projects: { used: number; max: number } } };
    expect(list.limits.projects).toEqual({ used: 2, max: 2 });

    await call(`/api/projects/${first.id}`, cookie, { method: "DELETE" });
    expect((await create(cookie)).status).toBe(201);
  });

  it("limits published links, and a revoked link frees its slot", async () => {
    const cookie = await signUp("links");
    const { id } = (await (await create(cookie)).json()) as { id: string };
    const publish = () => call(`/api/projects/${id}/share`, cookie, { method: "POST", body: JSON.stringify({ results: { c1: [{ x: 1 }] } }) });

    const first = await publish();
    expect(first.status).toBe(201);
    const { slug } = (await first.json()) as { slug: string };
    expect((await read(cookie, id)).shares).toEqual([expect.objectContaining({ slug, passwordProtected: false })]);

    const blocked = await publish();
    expect(blocked.status).toBe(402);
    expect(await blocked.json()).toMatchObject({ code: "limit_reached", limit: 1 });

    await call(`/api/shares/${slug}`, cookie, { method: "DELETE" });
    expect((await publish()).status).toBe(201);
  });

  it("keeps every project route private to its owner", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const { id } = (await (await create(alice)).json()) as { id: string };
    expect((await call(`/api/projects/${id}`, bob, { method: "PATCH", body: JSON.stringify({ title: "mine now" }) })).status).toBe(404);
    expect((await call(`/api/projects/${id}/duplicate`, bob, { method: "POST" })).status).toBe(404);
    expect((await call(`/api/projects/${id}/share`, bob, { method: "POST", body: JSON.stringify({ results: {} }) })).status).toBe(404);
    expect((await read(alice, id)).title).toBe("Sales");
    const bobList = (await (await call("/api/projects", bob)).json()) as { items: unknown[] };
    expect(bobList.items).toEqual([]);
  });
});
