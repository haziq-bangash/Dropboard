import { applyPrivacyFloor, detectCoordinates, guardSql, MAP_MIN_ROWS, STARTERS, suggestDashboard, type Range } from "@dropboard/engine";
import { describe, expect, it } from "vitest";
import { createSql } from "../eval/duckdb";

/** The map chart on real data: find the coordinates, bin them with the suggested SQL, and hold the privacy floor. */
describe("the map chart", () => {
  it("opens a file with latitude and longitude as a map, binned, with small bins kept off a published map", async () => {
    const sql = await createSql();
    const starter = STARTERS.find((s) => s.id === "delivery-drops")!;
    sql.load(starter.csv());

    const read = (q: string) => {
      const r = sql.run(q);
      return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
    };
    const [span] = read(`SELECT min(latitude) AS a, max(latitude) AS b, min(longitude) AS c, max(longitude) AS d FROM data`);
    const ranges: Record<string, Range> = { latitude: { min: Number(span.a), max: Number(span.b) }, longitude: { min: Number(span.c), max: Number(span.d) } };
    expect(detectCoordinates(ranges)).toMatchObject({ lat: "latitude", lon: "longitude" });

    const profile = { ...sql.profile(), coordinates: { lat: "latitude", lon: "longitude" } };
    const spec = suggestDashboard("Deliveries", profile);
    const map = spec.charts.find((c) => c.type === "map")!;
    expect(map).toBeDefined();

    const guarded = guardSql(map.query);
    expect(guarded.ok).toBe(true);
    const bins = read(guarded.ok ? guarded.sql : "");
    expect(bins.length).toBeGreaterThan(5);
    expect(bins.length).toBeLessThanOrEqual(2000);
    // every row lands in exactly one bin
    expect(bins.reduce((s, b) => s + Number(b.n), 0)).toBe(starter.rows);

    const published = applyPrivacyFloor(map, bins);
    expect(published.length).toBeLessThan(bins.length);
    for (const b of published) expect(Number(b.n)).toBeGreaterThanOrEqual(MAP_MIN_ROWS);
  });

  it("shades countries when a column holds them, adding up each country's rows", async () => {
    const sql = await createSql();
    const starter = STARTERS.find((s) => s.id === "delivery-drops")!;
    sql.load(starter.csv());
    const profile = { ...sql.profile(), countries: "country" };
    const chart = suggestDashboard("Deliveries", profile).charts.find((c) => c.type === "regions")!;
    expect(chart).toBeDefined();
    expect(chart.title).toBe("Average delivery_minutes by country");
    const guarded = guardSql(chart.query);
    expect(guarded.ok).toBe(true);
    const r = sql.run(guarded.ok ? guarded.sql : "");
    expect(r.rows).toHaveLength(8);
    expect(r.columns).toEqual(["x", "y"]);
  });

  it("is not suggested without coordinates, and the floor leaves other charts alone", () => {
    const sql = { rowCount: 100, columns: [{ name: "revenue", type: "number" as const, nullCount: 0, distinct: 90 }] };
    expect(suggestDashboard("No places", sql).charts.some((c) => c.type === "map" || c.type === "regions")).toBe(false);
    const rows = [{ n: 1 }, { n: 9 }];
    expect(applyPrivacyFloor({ type: "bar" }, rows)).toEqual(rows);
    expect(applyPrivacyFloor({ type: "map" }, rows)).toEqual([{ n: 9 }]);
  });
});
