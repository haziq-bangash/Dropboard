import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createAiFromEnv } from "./ai/providers";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createMailerFromEnv } from "./mail/mailer";
import { createPrisma } from "./db";

const port = Number(process.env.PORT ?? 8080); // Cloud Run injects PORT

function buildApp() {
  if (process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET) {
    const prisma = createPrisma();
    const ai = createAiFromEnv();
    const mailer = createMailerFromEnv();
    if (!mailer) console.warn("No mail provider configured (see MAIL_PROVIDER): password reset and email confirmation are off");
    if (ai) console.log(`AI enabled: ${ai.provider}/${ai.model}`);
    else console.warn("No AI provider configured (see AI_PROVIDER): AI routes disabled");
    return createApp({
      prisma,
      auth: createAuth(prisma, mailer),
      mailer,
      ai,
      aiDailyLimit: Number(process.env.AI_DAILY_LIMIT) || undefined,
    });
  }
  // Not configured yet: stay up so health checks pass, but refuse API traffic clearly.
  console.warn("DATABASE_URL or BETTER_AUTH_SECRET missing: API routes disabled");
  const app = new Hono();
  app.get("/health", (c) => c.text("ok"));
  app.all("/api/*", (c) => c.json({ error: "service not configured" }, 503));
  return app;
}

const server = serve({ fetch: buildApp().fetch, port }, () => console.log(`api listening on :${port}`));

// Cloud Run sends SIGTERM on scale-down
process.on("SIGTERM", () => server.close());
