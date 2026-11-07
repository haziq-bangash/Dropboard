import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { zValidator } from "@hono/zod-validator";
import { DashboardSpec } from "@dropboard/spec";

export const app = new Hono();

app.use("*", secureHeaders());
app.use("/api/*", cors({ origin: process.env.WEB_ORIGIN ?? "*" }));

app.get("/health", (c) => c.text("ok"));

// Placeholder: persist a dashboard spec (Firestore/GCS comes next).
app.post("/api/dashboards", zValidator("json", DashboardSpec), (c) => {
  const spec = c.req.valid("json");
  return c.json({ id: crypto.randomUUID(), title: spec.title }, 201);
});
