import { zValidator } from "@hono/zod-validator";
import { guardSql } from "@dropboard/engine";
import { AskInput, GenerateInput } from "@dropboard/spec";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { AppEnv } from "../types";
import { generateCacheKey } from "./cache";
import { buildSpec } from "./sanitize";
import { AiBadOutput, AiRefusal, type AiUsage } from "./schema";
import type { AiService } from "./service";

export const DEFAULT_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Options {
  prisma: PrismaClient;
  ai?: AiService;
  dailyLimit?: number;
  requireUser: MiddlewareHandler<AppEnv>;
}

export function registerAiRoutes(app: Hono<AppEnv>, { prisma, ai, dailyLimit = DEFAULT_DAILY_LIMIT, requireUser }: Options) {
  async function remaining(userId: string): Promise<number> {
    const used = await prisma.aiGeneration.count({
      where: { userId, cached: false, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
    });
    return Math.max(0, dailyLimit - used);
  }

  const log = (userId: string, kind: string, cached: boolean, usage?: AiUsage) =>
    prisma.aiGeneration.create({
      data: {
        userId,
        kind,
        cached,
        model: ai?.model ?? "unknown",
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens ?? 0,
      },
    });

  const small = bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: "request too large" }, 413) });

  app.post("/api/ai/generate", requireUser, small, zValidator("json", GenerateInput), async (c) => {
    if (!ai) return c.json({ error: "ai not configured" }, 503);
    const userId = c.get("userId");
    const input = c.req.valid("json");

    const key = generateCacheKey(ai.model, input);
    const hit = await prisma.aiCache.findUnique({ where: { key } });
    if (hit) {
      await log(userId, "generate", true);
      return c.json({ spec: hit.spec, cached: true, dropped: [], remaining: await remaining(userId) });
    }

    const left = await remaining(userId);
    if (left <= 0) return c.json({ error: "daily limit reached", remaining: 0 }, 429);

    try {
      const { output, usage } = await ai.generate(input);
      const { spec, dropped } = buildSpec(input.table, output);
      await prisma.aiCache.upsert({
        where: { key },
        create: { key, spec: spec as unknown as Prisma.InputJsonValue },
        update: {},
      });
      await log(userId, "generate", false, usage);
      return c.json({ spec, cached: false, dropped, remaining: left - 1 });
    } catch (e) {
      return failure(c, e);
    }
  });

  app.post("/api/ai/ask", requireUser, small, zValidator("json", AskInput), async (c) => {
    if (!ai) return c.json({ error: "ai not configured" }, 503);
    const userId = c.get("userId");
    const left = await remaining(userId);
    if (left <= 0) return c.json({ error: "daily limit reached", remaining: 0 }, 429);

    try {
      const { output, usage } = await ai.ask(c.req.valid("json"));
      const guarded = guardSql(output.sql);
      if (!guarded.ok) throw new AiBadOutput(`Unsafe query: ${guarded.reason}`);
      await log(userId, "ask", false, usage);
      return c.json({ sql: output.sql.trim().replace(/;+\s*$/, ""), explanation: output.explanation, remaining: left - 1 });
    } catch (e) {
      return failure(c, e);
    }
  });
}

// Failed or declined calls are not charged against the quota.
function failure(c: { json: (body: unknown, status: 422 | 502) => Response }, e: unknown): Response {
  if (e instanceof AiRefusal) return c.json({ error: "The assistant declined this request." }, 422);
  console.error("ai call failed:", e instanceof Error ? e.message : e);
  return c.json({ error: "The assistant could not produce a usable result. Try rephrasing." }, 502);
}
