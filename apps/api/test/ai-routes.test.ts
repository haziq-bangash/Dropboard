import type { AskInput, GenerateInput } from "@dropboard/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiBadOutput, AiRefusal, type AiAskOutput, type AiDashboardOutput } from "../src/ai/schema";
import type { AiService } from "../src/ai/service";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { createPrisma } from "../src/db";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";

const ORIGIN = process.env.BETTER_AUTH_URL;
const startedAt = new Date();

const goodOutput: AiDashboardOutput = {
  title: "Sales overview",
  charts: [
    { type: "kpi", title: "Rows", query: "SELECT count(*) AS value FROM data" },
    { type: "bar", title: "Bad", query: "DROP TABLE data" },
  ],
};

/** A scripted stand-in for the model. */
function fakeAi(opts: { generate?: () => AiDashboardOutput; ask?: () => AiAskOutput; fail?: Error } = {}) {
  const calls = { generate: 0, ask: 0 };
  const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0 };
  const service: AiService = {
    provider: "fake",
    model: "fake-model",
    async generate(_: GenerateInput) {
      calls.generate++;
      if (opts.fail) throw opts.fail;
      return { output: (opts.generate ?? (() => goodOutput))(), usage };
    },
    async ask(_: AskInput) {
      calls.ask++;
      if (opts.fail) throw opts.fail;
      return { output: (opts.ask ?? (() => ({ sql: 'SELECT count(*) AS n FROM data', explanation: "Counts rows." })))(), usage };
    },
  };
  return { service, calls };
}

const prisma = createPrisma();
const auth = createAuth(prisma);
const emails: string[] = [];

async function signUp(label: string) {
  const email = `${label}-${crypto.randomUUID()}@test.local`;
  emails.push(email);
  const res = await createApp({ prisma, auth }).request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: "correct-horse-battery", name: label }),
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

// Unique column names per call so cached results from earlier runs never match
const tableInput = (extra: Partial<GenerateInput> = {}): GenerateInput => ({
  table: {
    rowCount: 100,
    columns: [
      { name: `region_${crypto.randomUUID()}`, type: "string", nullCount: 0, distinct: 4 },
      { name: "amount", type: "number", nullCount: 0, distinct: 90 },
    ],
  },
  ...extra,
});

const post = (app: ReturnType<typeof createApp>, path: string, cookie: string | null, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

beforeAll(() => prisma.$connect());

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  await prisma.aiGeneration.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.aiCache.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("POST /api/ai/generate", () => {
  it("requires a session", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi().service });
    expect((await post(app, "/api/ai/generate", null, tableInput())).status).toBe(401);
  });

  it("returns 503 when AI is not configured", async () => {
    const app = createApp({ prisma, auth });
    const cookie = await signUp("noai");
    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(503);
  });

  it("validates the request body", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi().service });
    const cookie = await signUp("badbody");
    expect((await post(app, "/api/ai/generate", cookie, { table: { rowCount: 1, columns: [] } })).status).toBe(400);
    expect((await post(app, "/api/ai/generate", cookie, { ...tableInput(), instruction: "x".repeat(501) })).status).toBe(400);
  });

  it("builds a validated spec, drops unsafe charts, and counts against the quota", async () => {
    const { service, calls } = fakeAi();
    const app = createApp({ prisma, auth, ai: service, aiDailyLimit: 5 });
    const cookie = await signUp("gen");
    const input = tableInput();

    const res = await post(app, "/api/ai/generate", cookie, input);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      spec: { title: string; schema: unknown; charts: { id: string; query: string }[] };
      cached: boolean;
      dropped: { title: string; reason: string }[];
      remaining: number;
    };
    expect(body.cached).toBe(false);
    expect(body.remaining).toBe(4);
    expect(body.spec.title).toBe("Sales overview");
    expect(body.spec.schema).toEqual(input.table.columns.map((c) => ({ name: c.name, type: c.type })));
    expect(body.spec.charts.map((c) => c.id)).toEqual(["c1"]);
    expect(body.dropped).toEqual([{ title: "Bad", reason: "only SELECT is allowed" }]);
    expect(calls.generate).toBe(1);
  });

  it("serves repeats from the cache without calling the model or using quota", async () => {
    const { service, calls } = fakeAi();
    const app = createApp({ prisma, auth, ai: service, aiDailyLimit: 5 });
    const cookie = await signUp("cache");
    const input = tableInput({ instruction: "focus on revenue" });

    const first = (await (await post(app, "/api/ai/generate", cookie, input)).json()) as { remaining: number };
    const second = (await (await post(app, "/api/ai/generate", cookie, input)).json()) as { cached: boolean; remaining: number };
    expect(second.cached).toBe(true);
    expect(second.remaining).toBe(first.remaining);
    expect(calls.generate).toBe(1);

    // another user with the same schema also gets the cached result
    const other = await signUp("cache2");
    const third = (await (await post(app, "/api/ai/generate", other, input)).json()) as { cached: boolean };
    expect(third.cached).toBe(true);
    expect(calls.generate).toBe(1);
  });

  it("enforces the daily limit with a 429", async () => {
    const { service, calls } = fakeAi();
    const app = createApp({ prisma, auth, ai: service, aiDailyLimit: 2 });
    const cookie = await signUp("quota");

    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(200);
    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(200);
    const blocked = await post(app, "/api/ai/generate", cookie, tableInput());
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { remaining: number }).remaining).toBe(0);
    expect(calls.generate).toBe(2);

    // quota is per user
    const other = await signUp("quota2");
    expect((await post(app, "/api/ai/generate", other, tableInput())).status).toBe(200);
  });

  it("returns 502 and does not charge the quota when the model output is unusable", async () => {
    const { service } = fakeAi({ generate: () => ({ title: "x", charts: [{ type: "kpi", title: "bad", query: "DELETE FROM data" }] }) });
    const app = createApp({ prisma, auth, ai: service, aiDailyLimit: 1 });
    const cookie = await signUp("bad");

    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(502);
    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(502); // still not 429
  });

  it("returns 422 on a refusal and does not charge the quota", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi({ fail: new AiRefusal() }).service, aiDailyLimit: 1 });
    const cookie = await signUp("refuse");
    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(422);
    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(422);
  });

  it("records token usage for billing", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi().service });
    const cookie = await signUp("usage");
    await post(app, "/api/ai/generate", cookie, tableInput());
    const user = await prisma.user.findFirstOrThrow({ where: { name: "usage", email: { in: emails } } });
    const row = await prisma.aiGeneration.findFirstOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ kind: "generate", cached: false, model: "fake/fake-model", inputTokens: 100, outputTokens: 50 });
  });
});

describe("POST /api/ai/ask", () => {
  const ask = { table: tableInput().table, question: "How many rows are there?" };

  it("requires a session and a configured model", async () => {
    expect((await post(createApp({ prisma, auth, ai: fakeAi().service }), "/api/ai/ask", null, ask)).status).toBe(401);
    const cookie = await signUp("askno");
    expect((await post(createApp({ prisma, auth }), "/api/ai/ask", cookie, ask)).status).toBe(503);
  });

  it("returns guarded SQL and an explanation", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi({ ask: () => ({ sql: "SELECT count(*) AS n FROM data;", explanation: "Counts rows." }) }).service, aiDailyLimit: 3 });
    const cookie = await signUp("ask");
    const res = await post(app, "/api/ai/ask", cookie, ask);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sql: "SELECT count(*) AS n FROM data", explanation: "Counts rows.", remaining: 2 });
  });

  it("turns a double-escaped answer, with a backslash-n where a line break belongs, into a query that parses", async () => {
    const escaped = 'SELECT "region", count(*) AS n\\nFROM data\\nGROUP BY "region"';
    const app = createApp({ prisma, auth, ai: fakeAi({ ask: () => ({ sql: escaped, explanation: "Counts rows." }) }).service });
    const cookie = await signUp("askesc");
    const res = await post(app, "/api/ai/ask", cookie, ask);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sql: string };
    expect(body.sql).toBe('SELECT "region", count(*) AS n FROM data GROUP BY "region"');
    expect(body.sql).not.toContain("\\n");
  });

  it("turns the same escapes in a designed dashboard's charts into queries that parse", async () => {
    const app = createApp({
      prisma,
      auth,
      ai: fakeAi({ generate: () => ({ title: "t", charts: [{ type: "bar", title: "By region", query: 'SELECT region AS x, count(*) AS y\\nFROM data\\nGROUP BY 1' }] }) }).service,
    });
    const cookie = await signUp("genesc");
    const res = await post(app, "/api/ai/generate", cookie, { table: { rowCount: 3, columns: [{ name: "region", type: "string" }] } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { spec: { charts: { query: string }[] } };
    expect(body.spec.charts[0].query).toBe("SELECT region AS x, count(*) AS y FROM data GROUP BY 1");
  });

  it("rejects unsafe SQL from the model with a 502", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi({ ask: () => ({ sql: "COPY data TO '/tmp/x.csv'", explanation: "x" }) }).service });
    const cookie = await signUp("asku");
    expect((await post(app, "/api/ai/ask", cookie, ask)).status).toBe(502);
  });

  it("shares the daily quota with generate", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi().service, aiDailyLimit: 1 });
    const cookie = await signUp("askq");
    expect((await post(app, "/api/ai/generate", cookie, tableInput())).status).toBe(200);
    expect((await post(app, "/api/ai/ask", cookie, ask)).status).toBe(429);
  });

  it("validates the question", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi().service });
    const cookie = await signUp("askv");
    expect((await post(app, "/api/ai/ask", cookie, { ...ask, question: "hi" })).status).toBe(400);
  });

  it("maps a service failure to 502", async () => {
    const app = createApp({ prisma, auth, ai: fakeAi({ fail: new AiBadOutput() }).service });
    const cookie = await signUp("askf");
    expect((await post(app, "/api/ai/ask", cookie, ask)).status).toBe(502);
  });
});
