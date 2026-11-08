import { applyPrivacyFloor, boxplotChart, calendarChart, chartSummary, guardSql, heatmapChart, funnelChart, histogramChart, regionsChart, sankeyChart, STARTERS, suggestDashboard, treemapChart } from "@dropboard/engine";
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

  it("counts each bin exactly as a direct count would, including the empty ones", async () => {
    const sql = await createSql();
    sql.load(STARTERS.find((s) => s.id === "ecommerce-orders")!.csv());
    const bins = rowsOf(sql, histogramChart("revenue").query);
    const direct = rowsOf(
      sql,
      "WITH r AS (SELECT min(revenue) lo, (max(revenue) - min(revenue)) / 20 w FROM data) SELECT t.i AS i, (SELECT count(*) FROM data, r WHERE least(floor((revenue - lo) / w), 19) = t.i) AS n FROM range(20) t(i) ORDER BY 1",
    );
    expect(bins.map((b) => Number(b.y))).toEqual(direct.map((d) => Number(d.n)));
    // this sample is skewed, so some bins at the right are empty and must still be present
    expect(bins.some((b) => Number(b.y) === 0)).toBe(true);
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
    expect(types.length).toBeLessThanOrEqual(11);
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

describe("box plot on real data", () => {
  it("gives each group its median, middle half and whiskers, all taken from the data itself", async () => {
    const sql = await createSql();
    const starter = STARTERS.find((s) => s.id === "ecommerce-orders")!;
    sql.load(starter.csv());
    const spec = { ...boxplotChart("region", "revenue"), id: "b", layout: { x: 0, y: 0, w: 1, h: 1 } };
    const groups = rowsOf(sql, spec.query);
    expect(groups).toHaveLength(4);
    expect(groups.reduce((s, g) => s + Number(g.n), 0)).toBe(starter.rows);
    for (const g of groups) {
      // the median agrees with DuckDB's own
      const [m] = rowsOf(sql, `SELECT median(revenue) AS v FROM data WHERE region = '${g.x}'`);
      expect(Number(g.y)).toBeCloseTo(Number(m.v), 6);
      expect(Number(g.low)).toBeLessThanOrEqual(Number(g.q1));
      expect(Number(g.q1)).toBeLessThanOrEqual(Number(g.y));
      expect(Number(g.y)).toBeLessThanOrEqual(Number(g.q3));
      expect(Number(g.q3)).toBeLessThanOrEqual(Number(g.high));
      // whiskers are values that really occur, not computed fences
      const [seen] = rowsOf(sql, `SELECT count(*) AS n FROM data WHERE region = '${g.x}' AND (revenue = ${g.low} OR revenue = ${g.high})`);
      expect(Number(seen.n)).toBeGreaterThan(0);
    }
    // ordered by median, highest first
    expect(groups.map((g) => Number(g.y))).toEqual([...groups.map((g) => Number(g.y))].sort((a, b) => b - a));
    expect(chartSummary(spec, groups)).toMatch(/^Box plot: How revenue varies by region\. 4 groups\. Highest median: .+, middle half from .+ to .+\. Lowest median: .+/);
  });

  it("is suggested with a spread measure and a small category, and groups under five rows are left off a published one", async () => {
    const sql = await createSql();
    sql.load(STARTERS.find((s) => s.id === "ecommerce-orders")!.csv());
    expect(suggestDashboard("Orders", sql.profile()).charts.map((c) => c.type)).toContain("boxplot");
    const rows = [{ x: "a", n: 4 }, { x: "b", n: 5 }, { x: "c", n: 90 }];
    expect(applyPrivacyFloor({ type: "boxplot" }, rows).map((r) => r.x)).toEqual(["b", "c"]);
  });
});

describe("calendar on real data", () => {
  it("counts the rows on each day, one cell per day, and every row is in a cell", async () => {
    const sql = await createSql();
    const starter = STARTERS.find((s) => s.id === "ecommerce-orders")!;
    sql.load(starter.csv());
    const spec = { ...calendarChart("order_date"), id: "k", layout: { x: 0, y: 0, w: 1, h: 1 } };
    const days = rowsOf(sql, spec.query);
    expect(days.length).toBeGreaterThan(300);
    expect(days.length).toBeLessThanOrEqual(366);
    expect(days.every((d) => /^\d{4}-\d\d-\d\d$/.test(String(d.x)))).toBe(true);
    expect(days.reduce((s, d) => s + Number(d.y), 0)).toBe(starter.rows);
    expect(chartSummary(spec, days)).toMatch(/^Calendar: Rows per day by order_date\. \d+ days with rows, from 2025-\d\d-\d\d to 2025-\d\d-\d\d, .+ rows in all\. Busiest day .+ with .+, quietest day .+ with .+\.$/);
  });

  it("shows only the latest twelve months when the data runs longer", async () => {
    const sql = await createSql();
    const lines = ["day,v"];
    for (let i = 0; i < 1100; i++) lines.push(`${new Date(Date.UTC(2022, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)},1`);
    sql.load(lines.join("\n") + "\n");
    const days = rowsOf(sql, calendarChart("day").query);
    expect(days.length).toBe(366);
    expect(String(days[days.length - 1].x)).toBe("2025-01-04");
  });

  it("is suggested for a date column that covers many days, and not for one that covers few", async () => {
    const sql = await createSql();
    sql.load(STARTERS.find((s) => s.id === "ecommerce-orders")!.csv());
    expect(suggestDashboard("Orders", sql.profile()).charts.map((c) => c.type)).toContain("calendar");
    sql.load("day,v,w\n2025-01-01,1,5\n2025-01-02,2,6\n2025-01-03,3,7\n");
    expect(suggestDashboard("Few", sql.profile()).charts.map((c) => c.type)).not.toContain("calendar");
  });
});

describe("the data preview is always kept", () => {
  it("is the last chart even when a rich file fills the dashboard", async () => {
    const sql = await createSql();
    sql.load(STARTERS.find((s) => s.id === "ecommerce-orders")!.csv());
    const types = suggestDashboard("Orders", sql.profile()).charts.map((c) => c.type);
    expect(types.length).toBe(11);
    expect(types.at(-1)).toBe("table");
  });
});

describe("US state maps", () => {
  const states = ["Texas", "CA", "New York", "FL", "Illinois", "WA", "Ohio", "GA", "Alaska", "HI", "Colorado", "AZ"];
  const csv = ["state,sales,day"].concat(states.flatMap((s, i) => [0, 1, 2, 3].map((k) => `${s},${(i + 1) * 10 + k},2025-01-0${k + 1}`))).join("\n") + "\n";

  it("shades states for a column of states, and prefers it to a country map", async () => {
    const sql = await createSql();
    sql.load(csv);
    const profile = { ...sql.profile(), states: "state", countries: "state" };
    const charts = suggestDashboard("States", profile).charts.filter((c) => c.type === "regions");
    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({ map: "us", title: "sales by state" });
    const rows = rowsOf(sql, charts[0].query);
    expect(rows).toHaveLength(12);
  });

  it("leaves the map kind out for a country map", () => {
    expect(regionsChart("country")).not.toHaveProperty("map");
    expect(regionsChart("state", undefined, "us")).toHaveProperty("map", "us");
  });
});

describe("treemap, funnel and flow diagram on real data", () => {
  const layout = { id: "t", layout: { x: 0, y: 0, w: 1, h: 1 } };
  const setup = async () => {
    const sql = await createSql();
    const starter = STARTERS.find((s) => s.id === "ecommerce-orders")!;
    sql.load(starter.csv());
    const profile = sql.profile();
    const revenue = profile.columns.find((c) => c.name === "revenue")!;
    const [{ v: total }] = rowsOf(sql, "SELECT sum(revenue) AS v FROM data");
    return { sql, starter, revenue: { name: revenue.name, type: revenue.type, nullCount: revenue.nullCount ?? 0, distinct: revenue.distinct ?? 0 }, total: Number(total) };
  };

  it("a treemap's tiles add up to the whole, one level or two", async () => {
    const { sql, revenue, total } = await setup();
    const one = rowsOf(sql, treemapChart("category", revenue).query);
    expect(one).toHaveLength(6);
    expect(one.reduce((s, r) => s + Number(r.y), 0)).toBeCloseTo(total, 4);
    const two = rowsOf(sql, treemapChart("region", revenue, "category").query);
    expect(two).toHaveLength(24);
    expect(two.reduce((s, r) => s + Number(r.y), 0)).toBeCloseTo(total, 4);
    expect(chartSummary({ ...treemapChart("region", revenue, "category"), ...layout }, two)).toMatch(/^Treemap: revenue by region and category\. 4 groups, largest first: .+ \d+%.+\. Split into 24 parts; the largest is .+ under .+\.$/i);
    expect(chartSummary({ ...treemapChart("category"), ...layout }, rowsOf(sql, treemapChart("category").query))).toMatch(/^Treemap: Rows by category\. 6 groups, largest first: /);
  });

  it("a funnel lists stages widest first, and counts rows when no measure is named", async () => {
    const { sql, starter } = await setup();
    const spec = { ...funnelChart("channel"), ...layout };
    const stages = rowsOf(sql, spec.query);
    expect(stages.map((s) => Number(s.y))).toEqual([...stages.map((s) => Number(s.y))].sort((a, b) => b - a));
    expect(stages.reduce((s, r) => s + Number(r.y), 0)).toBe(starter.rows);
    expect(chartSummary(spec, stages)).toMatch(/^Funnel: Rows by channel\. 4 stages, widest first\. .+ .+, then .+ \(\d+% of the first\).+\.$/);
  });

  it("a flow diagram's bands add up to the whole, and bands over fewer than five rows are left off a published copy", async () => {
    const { sql, starter, revenue, total } = await setup();
    const spec = { ...sankeyChart("region", "channel", revenue), ...layout };
    const flows = rowsOf(sql, spec.query);
    expect(flows).toHaveLength(16);
    expect(flows.reduce((s, r) => s + Number(r.y), 0)).toBeCloseTo(total, 4);
    expect(flows.reduce((s, r) => s + Number(r.n), 0)).toBe(starter.rows);
    expect(chartSummary(spec, flows)).toMatch(/^Flow diagram: revenue from region to channel\. 16 flows from 4 starts to 4 ends\. Largest: .+ to .+ .+, .+ to .+ .+ and .+ to .+ .+\.$/);
    const rows = [{ x: "a", target: "b", y: 9, n: 4 }, { x: "a", target: "c", y: 8, n: 5 }];
    expect(applyPrivacyFloor({ type: "sankey" }, rows).map((r) => r.target)).toEqual(["c"]);
    expect(applyPrivacyFloor({ type: "treemap" }, rows)).toHaveLength(2);
  });

  it("leaves out tiles and bands that are not positive, since they cannot be drawn", async () => {
    const sql = await createSql();
    sql.load("g,h,v\na,x,5\na,y,-5\nb,x,3\nb,y,0\n");
    const profile = sql.profile();
    const v = profile.columns.find((c) => c.name === "v")!;
    const m = { name: v.name, type: v.type, nullCount: 0, distinct: v.distinct ?? 0 };
    expect(rowsOf(sql, treemapChart("g", m).query).map((r) => r.x)).toEqual(["b"]);
    expect(rowsOf(sql, sankeyChart("g", "h", m).query)).toHaveLength(2);
  });
});
