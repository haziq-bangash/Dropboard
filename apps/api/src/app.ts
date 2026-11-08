import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import type { Mailer } from "./mail/mailer";
import { allowedOrigins, googleEnabled, type Auth } from "./auth";
import { registerAiRoutes } from "./ai/routes";
import type { AiService } from "./ai/service";
import type { LimitsFor } from "./plans";
import { registerAccountRoutes } from "./account";
import { registerImportRoutes } from "./import/routes";
import type { FetchOptions, Fetched } from "./import/public-fetch";
import { registerProjectRoutes } from "./projects";
import type { AppEnv } from "./types";
import type { PrismaClient } from "./generated/prisma/client";

export interface Deps {
  prisma: PrismaClient;
  auth: Auth;
  /** Omit to disable AI routes (they return 503). */
  ai?: AiService;
  aiDailyLimit?: number;
  /** Present when email is configured: the web app then offers password reset and email confirmation. */
  mailer?: Mailer;
  /** Plan limits per user; defaults to the free plan. */
  limitsFor?: LimitsFor;
  shareLimits?: { requestsPerMinute: number; wrongPasswordsPerMinute: number };
  /** Fetches a file from a link for the import routes; replaced in tests. */
  importFetch?: (url: string, options?: FetchOptions) => Promise<Fetched>;
  /** Loosens the address checks of the import fetch. For tests only. */
  importOptions?: FetchOptions;
}

export function createApp({ prisma, auth, ai, aiDailyLimit, mailer, limitsFor, shareLimits, importFetch, importOptions }: Deps) {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders());
  const origins = allowedOrigins();
  if (origins.length) {
    app.use("/api/*", cors({ origin: origins, credentials: true }));
  }

  app.get("/health", (c) => c.text("ok"));

  // which optional sign-in methods the web app should offer
  app.get("/api/providers", (c) => c.json({ google: googleEnabled(), email: Boolean(mailer) }));

  // Better Auth: sign-up, sign-in, sessions, etc.
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", session.user.id);
    await next();
  });

  registerAiRoutes(app, { prisma, ai, dailyLimit: aiDailyLimit, requireUser });

  registerProjectRoutes(app, { prisma, requireUser, limitsFor, shareLimits });
  registerAccountRoutes(app, { prisma, requireUser, limitsFor, aiDailyLimit });
  registerImportRoutes(app, { requireUser, fetchLink: importFetch, options: importOptions });

  return app;
}
