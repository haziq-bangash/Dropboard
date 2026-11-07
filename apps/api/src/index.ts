import Anthropic from "@anthropic-ai/sdk";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createAnthropicAi, DEFAULT_MODEL } from "./ai/service";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createPrisma } from "./db";

const port = Number(process.env.PORT ?? 8080); // Cloud Run injects PORT

function buildApp() {
  if (process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET) {
    const prisma = createPrisma();
    const ai = process.env.ANTHROPIC_API_KEY
      ? createAnthropicAi(new Anthropic(), process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL)
      : undefined;
    if (!ai) console.warn("ANTHROPIC_API_KEY missing: AI routes disabled");
    return createApp({
      prisma,
      auth: createAuth(prisma),
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
