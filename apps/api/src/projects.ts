import { zValidator } from "@hono/zod-validator";
import { CreateProjectInput, DashboardSpec, PublishInput, UpdateProjectInput } from "@dropboard/spec";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { hashPassword, verifyPassword } from "./password";
import { limitsFor as defaultLimitsFor, type LimitsFor } from "./plans";
import type { AppEnv } from "./types";

interface Deps {
  prisma: PrismaClient;
  requireUser: MiddlewareHandler<AppEnv>;
  limitsFor?: LimitsFor;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Projects (saved dashboards), publishing, and the public share viewer endpoint. */
export function registerProjectRoutes(app: Hono<AppEnv>, { prisma, requireUser, limitsFor = defaultLimitsFor }: Deps) {
  const limitReached = (what: string, max: number) =>
    ({ error: `Your plan allows ${max} ${what}. Delete one or upgrade to add more.`, code: "limit_reached", limit: max }) as const;

  const activeLinks = (userId: string) => prisma.share.count({ where: { revokedAt: null, dashboard: { ownerId: userId } } });

  app.get("/api/projects", requireUser, async (c) => {
    const userId = c.get("userId");
    const [rows, limits, links] = await Promise.all([
      prisma.dashboard.findMany({
        where: { ownerId: userId },
        select: {
          id: true,
          title: true,
          sourceName: true,
          rowCount: true,
          createdAt: true,
          updatedAt: true,
          spec: true,
          shares: { where: { revokedAt: null }, select: { slug: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      limitsFor(userId),
      activeLinks(userId),
    ]);
    const items = rows.map(({ spec, shares, ...p }) => ({
      ...p,
      charts: (spec as { charts?: unknown[] }).charts?.length ?? 0,
      published: shares.length > 0,
    }));
    return c.json({
      items,
      limits: {
        projects: { used: items.length, max: limits.projects },
        publishedLinks: { used: links, max: limits.publishedLinks },
      },
    });
  });

  app.post("/api/projects", requireUser, zValidator("json", CreateProjectInput), async (c) => {
    const userId = c.get("userId");
    const { spec, source } = c.req.valid("json");
    const limits = await limitsFor(userId);
    if ((await prisma.dashboard.count({ where: { ownerId: userId } })) >= limits.projects) {
      return c.json(limitReached("saved projects", limits.projects), 402);
    }
    const created = await prisma.dashboard.create({
      data: { ownerId: userId, title: spec.title, spec: json(spec), sourceName: source?.fileName, rowCount: source?.rowCount },
      select: { id: true, title: true },
    });
    return c.json(created, 201);
  });

  app.get("/api/projects/:id", requireUser, async (c) => {
    const item = await prisma.dashboard.findFirst({
      where: { id: c.req.param("id"), ownerId: c.get("userId") },
      include: {
        shares: {
          where: { revokedAt: null },
          select: { slug: true, createdAt: true, passwordHash: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!item) return c.json({ error: "not found" }, 404);
    const { shares, ...project } = item;
    return c.json({
      ...project,
      shares: shares.map((s) => ({ slug: s.slug, createdAt: s.createdAt, passwordProtected: Boolean(s.passwordHash) })),
    });
  });

  app.patch("/api/projects/:id", requireUser, zValidator("json", UpdateProjectInput), async (c) => {
    const { title, spec, source } = c.req.valid("json");
    const where = { id: c.req.param("id"), ownerId: c.get("userId") };
    const data: Prisma.DashboardUpdateManyMutationInput = {};
    if (spec) {
      data.spec = json(title ? { ...spec, title } : spec);
      data.title = title ?? spec.title;
    } else if (title) {
      const current = await prisma.dashboard.findFirst({ where, select: { spec: true } });
      if (!current) return c.json({ error: "not found" }, 404);
      data.title = title;
      data.spec = json({ ...DashboardSpec.parse(current.spec), title });
    }
    if (source) {
      data.sourceName = source.fileName;
      data.rowCount = source.rowCount;
    }
    const { count } = await prisma.dashboard.updateMany({ where, data });
    return count ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  app.post("/api/projects/:id/duplicate", requireUser, async (c) => {
    const userId = c.get("userId");
    const original = await prisma.dashboard.findFirst({ where: { id: c.req.param("id"), ownerId: userId } });
    if (!original) return c.json({ error: "not found" }, 404);
    const limits = await limitsFor(userId);
    if ((await prisma.dashboard.count({ where: { ownerId: userId } })) >= limits.projects) {
      return c.json(limitReached("saved projects", limits.projects), 402);
    }
    const title = `${original.title} (copy)`.slice(0, 120);
    const copy = await prisma.dashboard.create({
      data: {
        ownerId: userId,
        title,
        spec: json({ ...DashboardSpec.parse(original.spec), title }),
        sourceName: original.sourceName,
        rowCount: original.rowCount,
      },
      select: { id: true, title: true },
    });
    return c.json(copy, 201);
  });

  app.delete("/api/projects/:id", requireUser, async (c) => {
    const { count } = await prisma.dashboard.deleteMany({ where: { id: c.req.param("id"), ownerId: c.get("userId") } });
    return count ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

  // ---- Publishing: read-only snapshots (spec + precomputed results, never raw rows) ----

  app.post(
    "/api/projects/:id/share",
    requireUser,
    bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: "snapshot too large" }, 413) }),
    zValidator("json", PublishInput),
    async (c) => {
      const userId = c.get("userId");
      const project = await prisma.dashboard.findFirst({ where: { id: c.req.param("id"), ownerId: userId } });
      if (!project) return c.json({ error: "not found" }, 404);

      const limits = await limitsFor(userId);
      if ((await activeLinks(userId)) >= limits.publishedLinks) {
        return c.json(limitReached("published links", limits.publishedLinks), 402);
      }

      const { results, password } = c.req.valid("json");
      // The raw-row preview table never leaves the browser, whatever the client sends
      const full = DashboardSpec.parse(project.spec);
      const spec = { ...full, charts: full.charts.filter((ch) => ch.type !== "table") };
      const known = new Set(spec.charts.map((ch) => ch.id));
      if (Object.keys(results).some((id) => !known.has(id))) {
        return c.json({ error: "results contain unknown chart ids" }, 400);
      }

      const slug = randomBytes(9).toString("base64url");
      await prisma.share.create({
        data: {
          slug,
          dashboardId: project.id,
          passwordHash: password ? await hashPassword(password) : null,
          spec: json(spec),
          results: json(results),
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
}
