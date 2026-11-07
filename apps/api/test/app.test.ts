import { describe, expect, it } from "vitest";
import { app } from "../src/app";

const post = (body: unknown) =>
  app.request("/api/dashboards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("api", () => {
  it("serves /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
  it("creates a dashboard from a valid spec", async () => {
    const res = await post({ version: 1, title: "t", schema: [], charts: [] });
    expect(res.status).toBe(201);
  });
  it("rejects an invalid spec", async () => {
    expect((await post({})).status).toBe(400);
  });
});
