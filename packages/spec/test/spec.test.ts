import { describe, expect, it } from "vitest";
import { DashboardSpec } from "../src";

const valid = { version: 1, title: "Sales", schema: [{ name: "amount", type: "number" }], charts: [] };

describe("DashboardSpec", () => {
  it("accepts a valid spec", () => {
    expect(DashboardSpec.safeParse(valid).success).toBe(true);
  });
  it("rejects an unknown version", () => {
    expect(DashboardSpec.safeParse({ ...valid, version: 2 }).success).toBe(false);
  });
  it("rejects more than 50 charts", () => {
    const chart = { id: "c", type: "bar", title: "t", query: "select 1", layout: { x: 0, y: 0, w: 1, h: 1 } };
    expect(DashboardSpec.safeParse({ ...valid, charts: Array(51).fill(chart) }).success).toBe(false);
  });
});

import { PublishInput, SHARE_MAX_ROWS_PER_CHART } from "../src";

describe("PublishInput", () => {
  it("accepts results and an optional password", () => {
    expect(PublishInput.safeParse({ results: { c1: [{ x: "a", y: 1 }] }, password: "hunter22" }).success).toBe(true);
    expect(PublishInput.safeParse({ results: {} }).success).toBe(true);
  });
  it("rejects too many rows, nested values and short passwords", () => {
    const rows = Array(SHARE_MAX_ROWS_PER_CHART + 1).fill({ x: 1 });
    expect(PublishInput.safeParse({ results: { c1: rows } }).success).toBe(false);
    expect(PublishInput.safeParse({ results: { c1: [{ x: { nested: 1 } }] } }).success).toBe(false);
    expect(PublishInput.safeParse({ results: {}, password: "abc" }).success).toBe(false);
  });
});
