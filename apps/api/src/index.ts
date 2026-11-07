import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createPrisma } from "./db";

const port = Number(process.env.PORT ?? 8080); // Cloud Run injects PORT

function buildApp() {
  if (process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET) {
    const prisma = createPrisma();
    return createApp({ prisma, auth: createAuth(prisma) });
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
