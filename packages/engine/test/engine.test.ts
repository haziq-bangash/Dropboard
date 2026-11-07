import { describe, expect, it } from "vitest";
import { DashboardSpec } from "@dropboard/spec";
import { guardSql, mapDuckDbType, q, suggestDashboard, type TableProfile } from "../src";

describe("mapDuckDbType", () => {
  it.each([
    ["BIGINT", "number"],
    ["DECIMAL(18,3)", "number"],
    ["DOUBLE", "number"],
    ["DATE", "date"],
    ["TIMESTAMP WITH TIME ZONE", "date"],
    ["BOOLEAN", "boolean"],
    ["VARCHAR", "string"],
  ])("%s -> %s", (input, expected) => expect(mapDuckDbType(input)).toBe(expected));
});

describe("q", () => {
  it("escapes quotes", () => expect(q('a"b')).toBe('"a""b"'));
});

const sales: TableProfile = {
  rowCount: 1000,
  columns: [
    { name: "order_id", type: "number", nullCount: 0, distinct: 1000 },
    { name: "date", type: "date", nullCount: 0, distinct: 300 },
    { name: "region", type: "string", nullCount: 0, distinct: 4 },
    { name: "amount", type: "number", nullCount: 2, distinct: 800 },
    { name: "qty", type: "number", nullCount: 0, distinct: 12 },
  ],
};

describe("suggestDashboard", () => {
  const spec = suggestDashboard("Sales", sales);
  it("produces a valid spec within the 8-chart cap", () => {
    expect(DashboardSpec.safeParse(spec).success).toBe(true);
    expect(spec.charts.length).toBeLessThanOrEqual(8);
  });
  it("includes trend, breakdown and table", () => {
    const types = spec.charts.map((c) => c.type);
    expect(types).toContain("line");
    expect(types).toContain("bar");
    expect(types).toContain("table");
  });
  it("skips id columns as measures", () => {
    expect(spec.charts.some((c) => c.title.includes("order_id"))).toBe(false);
  });
  it("only emits queries that pass the SQL guard", () => {
    for (const c of spec.charts) expect(guardSql(c.query).ok).toBe(true);
  });
  it("still works with no measures or dates", () => {
    const s = suggestDashboard("x", {
      rowCount: 10,
      columns: [{ name: "a", type: "string", nullCount: 0, distinct: 3 }],
    });
    expect(s.charts.length).toBeGreaterThan(0);
  });
});

describe("guardSql", () => {
  it("wraps and limits a select", () => {
    expect(guardSql("select 1;")).toEqual({ ok: true, sql: "SELECT * FROM (select 1) LIMIT 10000" });
  });
  it.each([
    "drop table data",
    "select 1; select 2",
    "select * from read_csv('/etc/passwd')",
    "select 1 -- hi",
    "copy data to 'x.csv'",
    "",
  ])("rejects %j", (sql) => expect(guardSql(sql).ok).toBe(false));
});
