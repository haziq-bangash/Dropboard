import type { GenerateInput } from "@dropboard/spec";
import { describe, expect, it } from "vitest";
import { generateCacheKey } from "../src/ai/cache";
import { askMessage, describeTable, generateMessage } from "../src/ai/prompt";
import { buildSpec } from "../src/ai/sanitize";
import { AiBadOutput } from "../src/ai/schema";

const table = {
  rowCount: 1000,
  columns: [
    { name: "region", type: "string" as const, nullCount: 0, distinct: 4 },
    { name: "amount", type: "number" as const, nullCount: 2, distinct: 800 },
  ],
};
const input: GenerateInput = { table };

describe("prompt", () => {
  it("describes schema and stats only, never values", () => {
    const text = describeTable(table);
    expect(text).toContain('"region" (string, 0 nulls, ~4 distinct)');
    expect(text).toContain('"amount" (number, 2 nulls, ~800 distinct)');
    expect(text).toContain("1000 rows");
  });
  it("escapes quotes in column names", () => {
    expect(describeTable({ rowCount: 1, columns: [{ name: 'a"b', type: "string" }] })).toContain('"a""b"');
  });
  it("includes the instruction and the current dashboard when editing", () => {
    const msg = generateMessage({
      table,
      instruction: "focus on revenue",
      current: {
        version: 1,
        title: "Old",
        schema: [],
        charts: [{ id: "c1", type: "bar", title: "By region", query: "SELECT 1", layout: { x: 0, y: 0, w: 1, h: 1 } }],
      },
    });
    expect(msg).toContain("Instruction: focus on revenue");
    expect(msg).toContain("By region");
  });
  it("builds the ask message", () => {
    expect(askMessage(table, "which region is biggest?")).toContain("Question: which region is biggest?");
  });
});

describe("generateCacheKey", () => {
  it("is stable and ignores stats", () => {
    const a = generateCacheKey("m", input);
    const b = generateCacheKey("m", { table: { rowCount: 5, columns: table.columns.map((c) => ({ name: c.name, type: c.type })) } });
    expect(a).toBe(b);
  });
  it("changes with model, columns and instruction", () => {
    const base = generateCacheKey("m", input);
    expect(generateCacheKey("other", input)).not.toBe(base);
    expect(generateCacheKey("m", { table: { rowCount: 1, columns: [table.columns[0]] } })).not.toBe(base);
    expect(generateCacheKey("m", { ...input, instruction: "x" })).not.toBe(base);
  });
});

describe("buildSpec", () => {
  const chart = (type: "kpi" | "bar", query: string, title = "t") => ({ type, title, query });

  it("builds a valid spec, taking the schema from the request", () => {
    const { spec, dropped } = buildSpec(table, {
      title: "Sales",
      charts: [chart("kpi", 'SELECT sum("amount") AS value FROM data'), chart("bar", 'SELECT "region" AS x, sum("amount") AS y FROM data GROUP BY 1')],
    });
    expect(dropped).toEqual([]);
    expect(spec.schema).toEqual([{ name: "region", type: "string" }, { name: "amount", type: "number" }]);
    expect(spec.charts.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(spec.charts[0]).not.toHaveProperty("x");
    expect(spec.charts[1]).toMatchObject({ x: "x", y: ["y"] });
  });
  it("drops charts whose SQL fails the guard and reports why", () => {
    const { spec, dropped } = buildSpec(table, {
      title: "Sales",
      charts: [chart("kpi", "DROP TABLE data", "bad"), chart("kpi", "SELECT count(*) AS value FROM data", "good")],
    });
    expect(spec.charts).toHaveLength(1);
    expect(spec.charts[0].id).toBe("c1");
    expect(dropped).toEqual([{ title: "bad", reason: "only SELECT is allowed" }]);
  });
  it("strips trailing semicolons but rejects multiple statements", () => {
    const { spec, dropped } = buildSpec(table, {
      title: "x",
      charts: [chart("kpi", "SELECT 1 AS value;"), chart("kpi", "SELECT 1; SELECT 2")],
    });
    expect(spec.charts[0].query).toBe("SELECT 1 AS value");
    expect(dropped).toHaveLength(1);
  });
  it("caps the number of charts", () => {
    const many = Array.from({ length: 30 }, () => chart("kpi", "SELECT 1 AS value"));
    expect(buildSpec(table, { title: "x", charts: many }).spec.charts).toHaveLength(12);
  });
  it("throws when nothing valid remains", () => {
    expect(() => buildSpec(table, { title: "x", charts: [chart("kpi", "DELETE FROM data")] })).toThrow(AiBadOutput);
  });
});
