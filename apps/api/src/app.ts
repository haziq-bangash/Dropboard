import { zValidator } from "@hono/zod-validator";
import { DashboardSpec, PublishInput } from "@dropboard/spec";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import { randomBytes } from "node:crypto";
import { allowedOrigins, googleEnabled, type Auth } from "./auth";
import { registerAiRoutes } from "./ai/routes";
import type { AiService } from "./ai/service";
import { hashPassword, verifyPassword } from "./password";
import type { AppEnv } from "./types";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

export interface Deps {
  prisma: PrismaClient;
  auth: Auth;
  /** Omit to disable AI routes (they return 503). */
  ai?: AiService;
  aiDailyLimit?: number;
}

export function createApp({ prisma, auth, ai, aiDailyLimit }: Deps) {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders());
  const origins = allowedOrigins();
  if (origins.length) {
    app.use("/api/*", cors({ origin: origins, credentials: true }));
  }

  app.get("/health", (c) => c.text("ok"));

  // which optional sign-in methods the web app should offer
  app.get("/api/providers", (c) => c.json({ google: googleEnabled() }));

  // Better Auth: sign-up, sign-in, sessions, etc.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", session.user.id);
    await next();
  });

  registerAiRoutes(app, { prisma, ai, dailyLimit: aiDailyLimit, requireUser });

  app.post("/api/dashboards", requireUser, zValidator("json", DashboardSpec), async (c) => {
    const spec = c.req.valid("json");
    const created = await prisma.dashboard.create({
      data: { ownerId: c.get("userId"), title: spec.title, spec: spec as unknown as Prisma.InputJsonValue },
      select: { id: true, title: true },
    });
    return c.json(created, 201);
  });

  app.get("/api/dashboards", requireUser, async (c) => {
    const items = await prisma.dashboard.findMany({
      where: { ownerId: c.get("userId") },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return c.json(items);
  });

  app.get("/api/dashboards/:id", requireUser, async (c) => {
    const item = await prisma.dashboard.findFirst({
      where: { id: c.req.param("id"), ownerId: c.get("userId") },
    });
    return item ? c.json(item) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/dashboards/:id", requireUser, async (c) => {
    const { count } = await prisma.dashboard.deleteMany({
      where: { id: c.req.param("id"), ownerId: c.get("userId") },
    });
    return count ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

  // ---- Publishing: read-only snapshots (spec + precomputed results, never raw rows) ----

  app.post(
    "/api/dashboards/:id/share",
    requireUser,
    bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: "snapshot too large" }, 413) }),
    zValidator("json", PublishInput),
    async (c) => {
      const dashboard = await prisma.dashboard.findFirst({
        where: { id: c.req.param("id"), ownerId: c.get("userId") },
      });
      if (!dashboard) return c.json({ error: "not found" }, 404);

      const { results, password } = c.req.valid("json");
      const spec = DashboardSpec.parse(dashboard.spec);
      const known = new Set(spec.charts.map((ch) => ch.id));
      if (Object.keys(results).some((id) => !known.has(id))) {
        return c.json({ error: "results contain unknown chart ids" }, 400);
      }

      const slug = randomBytes(9).toString("base64url");
      await prisma.share.create({
        data: {
          slug,
          dashboardId: dashboard.id,
          passwordHash: password ? await hashPassword(password) : null,
          spec: spec as unknown as Prisma.InputJsonValue,
          results: results as unknown as Prisma.InputJsonValue,
        },
      });
      return c.json({ slug }, 201);
    },
  );

  // Public. Password-protected shares need the `x-share-password` header.
  app.get("/api/shares/:slug", async (c) => {
    const share = await prisma.share.findUnique({ where: { slug: c.req.param("slug") } });
    if (!share || share.revokedAt) return c.json({ error: "not found" }, 404);

    if (share.passwordHash) {
      const supplied = c.req.header("x-share-password");
      if (!supplied) return c.json({ error: "password required", passwordRequired: true }, 401);
      if (!(await verifyPassword(supplied, share.passwordHash))) {
        return c.json({ error: "wrong password", passwordRequired: true }, 403);
      }
    }
    c.header("cache-control", "private, no-store");
    return c.json({ spec: share.spec, results: share.results, createdAt: share.createdAt });
  });

  app.delete("/api/shares/:slug", requireUser, async (c) => {
    const { count } = await prisma.share.updateMany({
      where: { slug: c.req.param("slug"), revokedAt: null, dashboard: { ownerId: c.get("userId") } },
      data: { revokedAt: new Date() },
    });
    return count ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

  return app;
}
