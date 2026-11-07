import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { createPrisma } from "../src/db";
import type { Mail } from "../src/mail/mailer";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";
const ORIGIN = process.env.BETTER_AUTH_URL;
const PASSWORD = "correct-horse-battery";

const spec = { version: 1, title: "Sales", schema: [{ name: "x", type: "number" }], charts: [{ id: "c1", type: "bar", title: "b", query: "SELECT 1 AS x", layout: { x: 0, y: 0, w: 1, h: 1 } }] };

describe("account (real Postgres)", () => {
  const prisma = createPrisma();
  const sent: Mail[] = [];
  const mailer = { send: async (m: Mail) => void sent.push(m) };
  // verified-email mail is on in this app, so sign-up needs the emailed link; a second app without mail is used where that gets in the way
  const plain = createApp({ prisma, auth: createAuth(prisma), aiDailyLimit: 7 });
  const withMail = createApp({ prisma, auth: createAuth(prisma, mailer), mailer });
  const emails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  async function signUp(label: string) {
    const email = `${label}-${crypto.randomUUID()}@test.local`;
    emails.push(email);
    const res = await plain.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password: PASSWORD, name: label }),
    });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { email, cookie, userId: user.id };
  }
  const call = (app: typeof plain, path: string, cookie: string | null, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) } });

  async function project(cookie: string, title = "Sales") {
    const res = await call(plain, "/api/projects", cookie, { method: "POST", body: JSON.stringify({ spec: { ...spec, title }, source: { fileName: "s.csv", rowCount: 9 } }) });
    return ((await res.json()) as { id: string }).id;
  }

  it("needs a session", async () => {
    expect((await call(plain, "/api/me/summary", null)).status).toBe(401);
    expect((await call(plain, "/api/me/export", null)).status).toBe(401);
  });

  it("summarises the plan, usage and sign-in methods", async () => {
    const { cookie, userId } = await signUp("summary");
    const id = await project(cookie);
    await call(plain, `/api/projects/${id}/share`, cookie, { method: "POST", body: JSON.stringify({ results: { c1: [{ x: 1 }] } }) });
    await prisma.aiGeneration.createMany({
      data: [
        { userId, kind: "generate", cached: false, model: "m" },
        { userId, kind: "generate", cached: true, model: "m" }, // cached answers are free
      ],
    });

    const s = (await (await call(plain, "/api/me/summary", cookie)).json()) as Record<string, any>;
    expect(s.plan).toBe("Free");
    expect(s.signInMethods).toEqual(["credential"]);
    expect(s.usage.projects).toEqual({ used: 1, max: 3 });
    expect(s.usage.publishedLinks).toEqual({ used: 1, max: 3 });
    // the allowance that is actually enforced, and only the uncached call counts
    expect(s.usage.pilotToday).toEqual({ used: 1, max: 7 });
  });

  it("exports everything held about the person, and nothing secret", async () => {
    const { cookie, email } = await signUp("export");
    const id = await project(cookie, "Export me");
    await call(plain, `/api/projects/${id}/share`, cookie, { method: "POST", body: JSON.stringify({ results: { c1: [{ x: 1 }] }, password: "link-secret" }) });

    const res = await call(plain, "/api/me/export", cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="dropboard-export-\d{4}-\d\d-\d\d\.json"$/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const text = await res.text();
    const data = JSON.parse(text);
    expect(data.account.email).toBe(email);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0]).toMatchObject({ title: "Export me", sourceName: "s.csv", rowCount: 9 });
    expect(data.projects[0].spec.charts).toHaveLength(1);
    expect(data.projects[0].publishedLinks[0]).toMatchObject({ passwordProtected: true });
    expect(data.note).toContain("rows are never stored");
    // no password hashes, tokens or the link password anywhere in the file
    expect(text).not.toContain("link-secret");
    expect(text).not.toMatch(/passwordHash|accessToken|refreshToken|"token"|scrypt/i);
    expect(text).not.toContain(PASSWORD);
  });

  it("exports only the requester's own data", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    await project(alice.cookie, "Alice only");
    const data = (await (await call(plain, "/api/me/export", bob.cookie)).json()) as { projects: unknown[]; account: { email: string } };
    expect(data.projects).toEqual([]);
    expect(data.account.email).toBe(bob.email);
  });

  it("deletes the account and everything under it, only with the right password", async () => {
    const { cookie, email, userId } = await signUp("delete");
    const id = await project(cookie);
    await call(plain, `/api/projects/${id}/share`, cookie, { method: "POST", body: JSON.stringify({ results: { c1: [{ x: 1 }] } }) });
    await prisma.aiGeneration.create({ data: { userId, kind: "ask", cached: false, model: "m" } });

    const wrong = await call(plain, "/api/auth/delete-user", cookie, { method: "POST", body: JSON.stringify({ password: "not-my-password" }) });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);

    const ok = await call(plain, "/api/auth/delete-user", cookie, { method: "POST", body: JSON.stringify({ password: PASSWORD }) });
    expect(ok.status).toBe(200);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.dashboard.count({ where: { ownerId: userId } })).toBe(0);
    expect(await prisma.share.count({ where: { dashboardId: id } })).toBe(0);
    expect(await prisma.aiGeneration.count({ where: { userId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    // the old session no longer works, and the address can be used again
    expect((await call(plain, "/api/me/summary", cookie)).status).toBe(401);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("changes a password, which then signs in with the new one only", async () => {
    const { cookie, email } = await signUp("password");
    const change = await call(plain, "/api/auth/change-password", cookie, {
      method: "POST",
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "a-new-password-123", revokeOtherSessions: true }),
    });
    expect(change.status).toBe(200);
    const signIn = (password: string) =>
      call(plain, "/api/auth/sign-in/email", null, { method: "POST", body: JSON.stringify({ email, password }) });
    expect((await signIn(PASSWORD)).status).toBe(401);
    expect((await signIn("a-new-password-123")).status).toBe(200);
  });

  it("refuses a password change with the wrong current password", async () => {
    const { cookie } = await signUp("wrongcurrent");
    const res = await call(plain, "/api/auth/change-password", cookie, {
      method: "POST",
      body: JSON.stringify({ currentPassword: "nope-nope-nope", newPassword: "a-new-password-123" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("is not offered an email change when mail is not set up", async () => {
    const { cookie } = await signUp("nomail");
    const res = await call(plain, "/api/auth/change-email", cookie, { method: "POST", body: JSON.stringify({ newEmail: `new-${crypto.randomUUID()}@test.local` }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("asks the current address to confirm an email change when mail is set up", async () => {
    // with mail on, sign-up needs a confirmed address, so confirm it the way a person would
    const email = `change-${crypto.randomUUID()}@test.local`;
    emails.push(email);
    await call(withMail, "/api/auth/sign-up/email", null, { method: "POST", body: JSON.stringify({ email, password: PASSWORD, name: "c" }) });
    await new Promise((r) => setTimeout(r, 50));
    const link = new URL(/https?:\/\/\S+/.exec(sent.at(-1)!.text)![0]);
    await withMail.request(link.pathname + link.search, { headers: { origin: ORIGIN } });
    const signIn = await call(withMail, "/api/auth/sign-in/email", null, { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

    const newEmail = `moved-${crypto.randomUUID()}@test.local`;
    emails.push(newEmail);
    const before = sent.length;
    const res = await call(withMail, "/api/auth/change-email", cookie, { method: "POST", body: JSON.stringify({ newEmail, callbackURL: "/app/account" }) });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1)).toMatchObject({ to: email, subject: expect.stringContaining("Confirm the change") });
    expect(sent.at(-1)!.text).toContain(newEmail);
    // nothing changes until the link is used
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).email).toBe(email);
  });
});
