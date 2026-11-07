import { zValidator } from "@hono/zod-validator";
import { DashboardSpec } from "@dropboard/spec";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import { allowedOrigins, type Auth } from "./auth";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

export interface Deps {
  prisma: PrismaClient;
  auth: Auth;
}

type AppEnv = { Variables: { userId: string } };

export function createApp({ prisma, auth }: Deps) {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders());
  const origins = allowedOrigins();
  if (origins.length) {
    app.use("/api/*", cors({ origin: origins, credentials: true }));
  }

  app.get("/health", (c) => c.text("ok"));

  // Better Auth: sign-up, sign-in, sessions, etc.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", session.user.id);
    await next();
  });

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

  return app;
}
