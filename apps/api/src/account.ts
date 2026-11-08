import type { Hono, MiddlewareHandler } from "hono";
import type { PrismaClient } from "./generated/prisma/client";
import { limitsFor as defaultLimitsFor, PLANS, type LimitsFor } from "./plans";
import type { AppEnv } from "./types";

interface Deps {
  prisma: PrismaClient;
  requireUser: MiddlewareHandler<AppEnv>;
  limitsFor?: LimitsFor;
  /** The Pilot allowance actually enforced (it can be overridden by AI_DAILY_LIMIT). */
  aiDailyLimit?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** What someone can see and take about their own account: their plan and usage, and everything we hold about them. */
export function registerAccountRoutes(app: Hono<AppEnv>, { prisma, requireUser, limitsFor = defaultLimitsFor, aiDailyLimit }: Deps) {
  app.get("/api/me/summary", requireUser, async (c) => {
    const userId = c.get("userId");
    const [limits, projects, links, pilotToday, user] = await Promise.all([
      limitsFor(userId),
      prisma.dashboard.count({ where: { ownerId: userId } }),
      prisma.share.count({ where: { revokedAt: null, dashboard: { ownerId: userId } } }),
      prisma.aiGeneration.count({ where: { userId, cached: false, createdAt: { gt: new Date(Date.now() - DAY_MS) } } }),
      prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, accounts: { select: { providerId: true } } } }),
    ]);
    return c.json({
      plan: PLANS[limits.plan].name,
      planId: limits.plan,
      memberSince: user?.createdAt ?? null,
      // which ways of signing in this account has, so the page offers a password form only where it applies
      signInMethods: [...new Set((user?.accounts ?? []).map((a) => a.providerId))],
      usage: {
        projects: { used: projects, max: limits.projects },
        publishedLinks: { used: links, max: limits.publishedLinks },
        pilotToday: { used: pilotToday, max: aiDailyLimit ?? limits.pilotPerDay },
      },
    });
  });

  // Everything held about this person, as one file. Rows are never stored, so they are not in it, and no secrets are.
  app.get("/api/me/export", requireUser, async (c) => {
    const userId = c.get("userId");
    const [user, projects, pilot] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, emailVerified: true, createdAt: true, accounts: { select: { providerId: true, createdAt: true } } },
      }),
      prisma.dashboard.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          sourceName: true,
          rowCount: true,
          spec: true,
          createdAt: true,
          updatedAt: true,
          shares: { select: { slug: true, createdAt: true, revokedAt: true, passwordHash: true }, orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.aiGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { kind: true, cached: true, model: true, inputTokens: true, outputTokens: true, createdAt: true },
      }),
    ]);

    const stamp = new Date().toISOString().slice(0, 10);
    c.header("content-disposition", `attachment; filename="dropboard-export-${stamp}.json"`);
    c.header("cache-control", "private, no-store");
    return c.json({
      exportedAt: new Date().toISOString(),
      note: "Your spreadsheet rows are never stored on Dropboard's servers, so they are not part of this file.",
      account: {
        name: user?.name,
        email: user?.email,
        emailVerified: user?.emailVerified,
        createdAt: user?.createdAt,
        signInMethods: (user?.accounts ?? []).map((a) => ({ method: a.providerId, since: a.createdAt })),
      },
      projects: projects.map(({ shares, ...p }) => ({
        ...p,
        publishedLinks: shares.map((s) => ({ slug: s.slug, createdAt: s.createdAt, turnedOffAt: s.revokedAt, passwordProtected: Boolean(s.passwordHash) })),
      })),
      pilotUsage: pilot,
    });
  });
}
