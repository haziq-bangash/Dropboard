import { chartSummary, guardSql, heatmapChart, histogramChart, STARTERS, suggestDashboard } from "@dropboard/engine";
import { describe, expect, it } from "vitest";
import { createSql } from "../eval/duckdb";

const rowsOf = (sql: Awaited<ReturnType<typeof createSql>>, query: string) => {
  const guarded = guardSql(query);
  expect(guarded.ok).toBe(true);
  const r = sql.run(guarded.ok ? guarded.sql : "");
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
};

describe("histogram and heatmap on real data", () => {
  it("bins a measure into twenty ranges that hold every row", async () => {
    const sql = await createSql();
    const starter = STARTERS.find((s) => s.id === "ecommerce-orders")!;
    sql.load(starter.csv());
    const spec = { ...histogramChart("revenue"), id: "h", layout: { x: 0, y: 0, w: 1, h: 1 } };
    const bins = rowsOf(sql, spec.query);
    expect(bins).toHaveLength(20);
    expect(bins.reduce((s, b) => s + Number(b.y), 0)).toBe(starter.rows);
    // bins are in order and touch: each starts where the last one ended
    for (let i = 1; i < bins.length; i++) expect(Number(bins[i].x)).toBeCloseTo(Number(bins[i - 1].x) + Number(bins[i - 1].w), 6);
    expect(chartSummary(spec, bins)).toMatch(/^Histogram: How revenue is spread out\. 20 bins from .+ to .+\. The most rows, .+ of .+, fall between .+ and .+\.$/);
  });

  it("still gives twenty bins when every value is the same, with all rows in the first", async () => {
    const sql = await createSql();
    sql.load("a,b\n5,1\n5,2\n5,3\n");
    const bins = rowsOf(sql, histogramChart("a").query);
    expect(bins).toHaveLength(20);
    expect(Number(bins[0].y)).toBe(3);
    expect(bins.slice(1).every((b) => Number(b.y) === 0)).toBe(true);
  });

  it("crosses two categories with a measure, one cell per combination", async () => {
    const sql = await createSql();
    const starter = STARTERS.find((s) => s.id === "ecommerce-orders")!;
    sql.load(starter.csv());
    const spec = { ...heatmapChart("region", "channel"), id: "m", layout: { x: 0, y: 0, w: 1, h: 1 } };
    const cells = rowsOf(sql, spec.query);
    const [{ n }] = rowsOf(sql, "SELECT count(*) AS n FROM (SELECT DISTINCT region, channel FROM data)");
    expect(cells).toHaveLength(Number(n));
    expect(cells.reduce((s, c) => s + Number(c.value), 0)).toBe(starter.rows);
    expect(chartSummary(spec, cells)).toMatch(/^Heatmap: Rows by region and channel\. \d+ combinations\. Highest: .+ and .+, .+\. Lowest: .+ and .+, .+\.$/);
  });

  it("are suggested for a file with a spread measure and two small categories", async () => {
    const sql = await createSql();
    sql.load(STARTERS.find((s) => s.id === "ecommerce-orders")!.csv());
    const types = suggestDashboard("Orders", sql.profile()).charts.map((c) => c.type);
    expect(types).toContain("histogram");
    expect(types).toContain("heatmap");
    expect(types.length).toBeLessThanOrEqual(10);
  });
});

describe("latitude and longitude are positions, not amounts", () => {
  it("never become a total, an average or a chart measure when a map is made from them", async () => {
    const sql = await createSql();
    sql.load(STARTERS.find((s) => s.id === "delivery-drops")!.csv());
    const spec = suggestDashboard("Deliveries", { ...sql.profile(), coordinates: { lat: "latitude", lon: "longitude" } });
    const queries = spec.charts.filter((c) => c.type !== "map" && c.type !== "table").map((c) => c.query);
    expect(queries.length).toBeGreaterThan(3);
    for (const query of queries) expect(query).not.toMatch(/latitude|longitude/);
    expect(spec.charts.some((c) => c.type === "map")).toBe(true);
  });
});
