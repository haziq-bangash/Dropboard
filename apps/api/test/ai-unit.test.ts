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

describe("buildSpec with charts described by columns", () => {
  const places = {
    rowCount: 500,
    columns: [
      { name: "country", type: "string" as const, nullCount: 0, distinct: 12 },
      { name: "channel", type: "string" as const, nullCount: 0, distinct: 4 },
      { name: "lat", type: "number" as const, nullCount: 0, distinct: 400 },
      { name: "lng", type: "number" as const, nullCount: 0, distinct: 400 },
      { name: "revenue", type: "number" as const, nullCount: 0, distinct: 300 },
      { name: "notes", type: "string" as const, nullCount: 0, distinct: 480 },
    ],
  };
  const chart = (type: "kpi" | "bar", query: string, title = "t") => ({ type, title, query });
  const special = (type: "histogram" | "heatmap" | "map" | "regions", columns: string[], title = "") => ({ type, title, query: "", columns });

  it("builds the query on the server, so the model only names columns", () => {
    const { spec, dropped } = buildSpec(places, {
      title: "Places",
      charts: [
        special("histogram", ["revenue"], "Spread of revenue"),
        special("heatmap", ["country", "channel", "revenue"]),
        special("map", ["lat", "lng"]),
        special("regions", ["country", "revenue"]),
      ],
    });
    expect(dropped).toEqual([]);
    expect(spec.charts.map((c) => c.type)).toEqual(["histogram", "heatmap", "map", "regions"]);
    expect(spec.charts[0].title).toBe("Spread of revenue");
    // an empty title falls back to the builder's own
    expect(spec.charts[1].title).toBe("revenue by country and channel");
    expect(spec.charts[2].query).toContain('"lat"');
    for (const c of spec.charts) expect(c).toMatchObject({ x: "x", y: ["y"] });
  });

  it("drops a chart with an unknown column, a wrong type, too few columns, or too many categories", () => {
    const { spec, dropped } = buildSpec(places, {
      title: "x",
      charts: [
        chart("kpi", "SELECT count(*) AS value FROM data"),
        special("histogram", ["nope"]),
        special("histogram", ["country"]),
        special("heatmap", ["country"]),
        special("heatmap", ["country", "notes"]),
        special("map", ["lat", "country"]),
        special("regions", ["revenue"]),
        special("regions", []),
      ],
    });
    expect(spec.charts).toHaveLength(1);
    expect(dropped.map((d) => d.reason)).toEqual([
      "no column called nope",
      "country is not a number column",
      "heatmap needs 2 column names",
      "a heatmap needs columns with few distinct values",
      "a map needs a latitude and a longitude number column",
      "revenue is not a text column",
      "regions needs 1 column name",
    ]);
  });

  it("never lets a column name that is not in the table reach a query", () => {
    const { dropped } = buildSpec(places, {
      title: "x",
      charts: [chart("kpi", "SELECT 1 AS value"), special("histogram", ['revenue") FROM data; DROP TABLE data; --'])],
    });
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toMatch(/^no column called/);
  });
});

describe("buildSpec with a box plot", () => {
  const t = {
    rowCount: 100,
    columns: [
      { name: "team", type: "string" as const, nullCount: 0, distinct: 6 },
      { name: "names", type: "string" as const, nullCount: 0, distinct: 90 },
      { name: "score", type: "number" as const, nullCount: 0, distinct: 80 },
    ],
  };
  const box = (columns: string[]) => ({ type: "boxplot" as const, title: "", query: "", columns });
  it("builds from a small text column and a number column, and drops the wrong shapes", () => {
    const { spec, dropped } = buildSpec(t, {
      title: "x",
      charts: [box(["team", "score"]), box(["score", "team"]), box(["names", "score"]), box(["team"]), { type: "kpi", title: "k", query: "SELECT 1 AS value", columns: [] }],
    });
    expect(spec.charts.map((c) => c.type)).toEqual(["boxplot", "kpi"]);
    expect(spec.charts[0].title).toBe("How score varies by team");
    expect(dropped.map((d) => d.reason)).toEqual(["score is not a text column", "a box plot needs a column with few distinct values", "boxplot needs 2 column names"]);
  });
});

describe("buildSpec with a calendar", () => {
  const t = {
    rowCount: 100,
    columns: [
      { name: "when", type: "date" as const, nullCount: 0, distinct: 90 },
      { name: "team", type: "string" as const, nullCount: 0, distinct: 6 },
    ],
  };
  it("needs a date column", () => {
    const { spec, dropped } = buildSpec(t, {
      title: "x",
      charts: [{ type: "calendar", title: "", query: "", columns: ["when"] }, { type: "calendar", title: "", query: "", columns: ["team"] }, { type: "kpi", title: "k", query: "SELECT 1 AS value", columns: [] }],
    });
    expect(spec.charts.map((c) => c.type)).toEqual(["calendar", "kpi"]);
    expect(dropped.map((d) => d.reason)).toEqual(["team is not a date column"]);
  });
});

describe("buildSpec with a state map", () => {
  const t = {
    rowCount: 100,
    columns: [
      { name: "state", type: "string" as const, nullCount: 0, distinct: 20 },
      { name: "sales", type: "number" as const, nullCount: 0, distinct: 80 },
    ],
  };
  it("builds a US map from a text column and an optional number, and drops the wrong shapes", () => {
    const { spec, dropped } = buildSpec(t, {
      title: "x",
      charts: [
        { type: "statemap", title: "", query: "", columns: ["state", "sales"] },
        { type: "statemap", title: "", query: "", columns: ["sales"] },
        { type: "statemap", title: "", query: "", columns: ["state", "state"] },
        { type: "kpi", title: "k", query: "SELECT 1 AS value", columns: [] },
      ],
    });
    expect(spec.charts.map((c) => c.type)).toEqual(["regions", "kpi"]);
    expect(spec.charts[0]).toMatchObject({ map: "us", title: "sales by state" });
    expect(dropped.map((d) => d.reason)).toEqual(["sales is not a text column", "state is not a number column"]);
  });
});
