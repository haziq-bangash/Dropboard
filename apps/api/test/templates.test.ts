import { guardSql, templateChart, type TemplateColumn } from "@dropboard/engine";
import { describe, expect, it } from "vitest";
import { buildSpec } from "../src/ai/sanitize";
import { createSql } from "../eval/duckdb";

const CSV = ["order date,region,channel,revenue,quantity"]
  .concat(Array.from({ length: 120 }, (_, i) => `2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")},${["North", "South", "East"][i % 3]},${i % 2 ? "web" : "store"},${10 + i},${1 + (i % 5)}`))
  .join("\n");

const columns: TemplateColumn[] = [
  { name: "order date", type: "date" },
  { name: "region", type: "string" },
  { name: "channel", type: "string" },
  { name: "revenue", type: "number" },
  { name: "quantity", type: "number" },
];

async function run(query: string) {
  const sql = await createSql();
  sql.load(CSV + "\n");
  const r = sql.run(query);
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
}

describe("chart templates", () => {
  it("builds a headline number, summing a number column unless told otherwise", async () => {
    const sum = templateChart("kpi", ["revenue"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(sum.title).toBe("Total revenue");
    expect(guardSql(sum.query).ok).toBe(true);
    expect(Number((await run(sum.query))[0].value)).toBe(Array.from({ length: 120 }, (_, i) => 10 + i).reduce((a, b) => a + b, 0));
    const avg = templateChart("kpi", ["quantity", "avg"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(avg.title).toBe("Average quantity");
    expect(Number((await run(avg.query))[0].value)).toBeCloseTo(3, 1);
    // a text column is counted by its different values
    const distinct = templateChart("kpi", ["region"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(Number((await run(distinct.query))[0].value)).toBe(3);
  });

  it("builds bars by a category: a total, an average, or a count of rows", async () => {
    const bars = templateChart("bar", ["region", "revenue"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(bars.x).toBe("x");
    const rows = await run(bars.query);
    expect(rows.map((r) => r.x).sort()).toEqual(["East", "North", "South"]);
    const counts = templateChart("bar", ["channel"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect((await run(counts.query)).map((r) => Number(r.y))).toEqual([60, 60]);
    const avg = templateChart("pie", ["channel", "revenue", "avg"], columns, "Mix") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(avg.title).toBe("Mix");
    expect(avg.type).toBe("pie");
    expect(guardSql(avg.query).ok).toBe(true);
  });

  it("builds a line over time, by month unless a step is named", async () => {
    const line = templateChart("line", ["order date", "revenue"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(line.query).toContain("date_trunc('month'");
    const rows = await run(line.query);
    expect(rows.length).toBe(12);
    const weekly = templateChart("area", ["order date", "revenue", "sum", "week"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(weekly.type).toBe("area");
    expect(weekly.query).toContain("date_trunc('week'");
    expect((await run(weekly.query)).length).toBeGreaterThan(12);
    const rowsOnly = templateChart("line", ["order date"], columns, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(rowsOnly.query).toContain("count(*)");
  });

  it("says why a template cannot be built, and never lets an unknown name through", () => {
    expect(templateChart("kpi", ["nope"], columns, "")).toBe("no column called nope");
    expect(templateChart("kpi", ["region", "sum"], columns, "")).toMatch(/not a number column/);
    expect(templateChart("bar", ["revenue"], columns, "")).toMatch(/not a column to group by/);
    expect(templateChart("bar", ["region", "channel"], columns, "")).toMatch(/not a number column/);
    expect(templateChart("line", ["region", "revenue"], columns, "")).toMatch(/not a date column/);
    expect(templateChart("bar", ["region", "revenue", "sum", "avg"], columns, "")).toMatch(/more than one aggregation/);
    expect(templateChart("bar", ["region", "revenue", "month"], columns, "")).toMatch(/no time step/);
    // a column that merely has an aggregation's name is still a column
    expect(templateChart("kpi", ["sum"], [{ name: "sum", type: "number" }], "")).toMatchObject({ query: expect.stringContaining('sum("sum")') });
    // quotes in a column name are escaped, not trusted
    const odd = [{ name: 'a"b', type: "number" as const }];
    const built = templateChart("kpi", ['a"b'], odd, "") as Exclude<ReturnType<typeof templateChart>, string>;
    expect(built.query).toContain('"a""b"');
  });

  it("is used for a model's chart that leaves the query empty, and the old way of writing SQL still works", () => {
    const table = { rowCount: 120, columns: columns.map((c) => ({ ...c, distinct: 5 })) };
    const { spec, dropped } = buildSpec(table, {
      title: "Orders",
      charts: [
        { type: "kpi", title: "Revenue", query: "", columns: ["revenue", "sum"] },
        { type: "bar", title: "By region", query: "", columns: ["region", "revenue"] },
        { type: "line", title: "Over time", query: "", columns: ["order date", "revenue", "month"] },
        { type: "bar", title: "Written by hand", query: 'SELECT "region" AS x, count(*) AS y FROM data GROUP BY 1', columns: [] },
        { type: "bar", title: "Wrong column", query: "", columns: ["colour"] },
      ],
    });
    expect(spec.charts.map((c) => c.title)).toEqual(["Revenue", "By region", "Over time", "Written by hand"]);
    expect(dropped).toEqual([{ title: "Wrong column", reason: "no column called colour" }]);
    for (const c of spec.charts) expect(guardSql(c.query).ok).toBe(true);
  });
});
