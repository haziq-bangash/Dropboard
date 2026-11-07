import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { createPrisma } from "../src/db";
import { createMailerFromEnv, type Mail } from "../src/mail/mailer";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";
const ORIGIN = process.env.BETTER_AUTH_URL;

describe("email confirmation and password reset (real Postgres, captured mail)", () => {
  const prisma = createPrisma();
  const sent: Mail[] = [];
  const mailer = { send: async (m: Mail) => void sent.push(m) };
  const app = createApp({ prisma, auth: createAuth(prisma, mailer), mailer });
  const email = `acct-${crypto.randomUUID()}@test.local`;
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });
  const lastLink = () => /https?:\/\/\S+/.exec(sent.at(-1)!.text)![0];
  const settle = () => new Promise((r) => setTimeout(r, 50));

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("tells the web app that email is available", async () => {
    expect(((await (await app.request("/api/providers")).json()) as { email: boolean }).email).toBe(true);
  });

  it("sends a confirmation link on sign-up and refuses sign-in until it is used", async () => {
    const up = await post("/api/auth/sign-up/email", { email, password: "correct-horse-battery", name: "t" });
    expect(up.status).toBe(200);
    expect(up.headers.getSetCookie().length).toBe(0); // no session before confirming
    await settle();
    expect(sent.at(-1)).toMatchObject({ to: email, subject: expect.stringContaining("Confirm") });

    const early = await post("/api/auth/sign-in/email", { email, password: "correct-horse-battery" });
    expect(early.status).toBe(403);

    const verify = await app.request(new URL(lastLink()).pathname + new URL(lastLink()).search, { headers: { origin: ORIGIN } });
    expect([200, 302]).toContain(verify.status);

    const ok = await post("/api/auth/sign-in/email", { email, password: "correct-horse-battery" });
    expect(ok.status).toBe(200);
  });

  it("resets a forgotten password with the emailed link, once", async () => {
    const res = await post("/api/auth/request-password-reset", { email, redirectTo: `${ORIGIN}/reset-password` });
    expect(res.status).toBe(200);
    await settle();
    const mail = sent.at(-1)!;
    expect(mail.subject).toContain("Reset");
    const token = new URL(lastLink()).pathname.split("/").pop()!;

    const reset = await post("/api/auth/reset-password", { newPassword: "a-brand-new-password", token });
    expect(reset.status).toBe(200);
    expect((await post("/api/auth/sign-in/email", { email, password: "correct-horse-battery" })).status).toBe(401);
    expect((await post("/api/auth/sign-in/email", { email, password: "a-brand-new-password" })).status).toBe(200);
    expect((await post("/api/auth/reset-password", { newPassword: "another-password-1", token })).status).toBe(400);
  });

  it("answers the same for an unknown address, so accounts cannot be probed", async () => {
    const before = sent.length;
    const res = await post("/api/auth/request-password-reset", { email: `nobody-${crypto.randomUUID()}@test.local`, redirectTo: `${ORIGIN}/reset-password` });
    expect(res.status).toBe(200);
    await settle();
    expect(sent.length).toBe(before);
  });
});

describe("without a mail provider", () => {
  it("stays off, so sign-up still works and nobody is locked out", () => {
    expect(createMailerFromEnv({})).toBeUndefined();
    expect(createMailerFromEnv({ MAIL_PROVIDER: "resend" })).toBeUndefined(); // key and sender missing
  });

  it("sends through Resend with the key and sender", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response("{}", { status: 200 }))) as unknown as typeof fetch;
    const mailer = createMailerFromEnv({ RESEND_API_KEY: "k", MAIL_FROM: "Dropboard <a@b.c>" }, { fetch: fakeFetch })!;
    await mailer.send({ to: "x@y.z", subject: "s", text: "t", html: "<p>t</p>" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ from: "Dropboard <a@b.c>", to: "x@y.z" });

    const failing = createMailerFromEnv({ RESEND_API_KEY: "k", MAIL_FROM: "f" }, { fetch: (async () => new Response("no", { status: 403 })) as unknown as typeof fetch })!;
    await expect(failing.send({ to: "x@y.z", subject: "s", text: "t", html: "t" })).rejects.toThrow("403");
  });
});
