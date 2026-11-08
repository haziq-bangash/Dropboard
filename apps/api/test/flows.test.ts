import { applyPrivacyFloor, chartSummary, findFlowColumns, flowMapChart, guardSql, suggestDashboard, type ColumnProfile } from "@dropboard/engine";
import { describe, expect, it, vi } from "vitest";
import { buildSpec } from "../src/ai/sanitize";
import { createSql } from "../eval/duckdb";

vi.setConfig({ testTimeout: 60_000 });

const measure: ColumnProfile = { name: "shipments", type: "number", nullCount: 0, distinct: 30, min: 1, max: 50, integer: true };

describe("flow map", () => {
  it("finds an origin and a destination among columns of cities, and does not guess the direction", () => {
    expect(findFlowColumns(["origin_city", "destination_city"])).toEqual({ from: "origin_city", to: "destination_city" });
    expect(findFlowColumns(["destination", "origin"])).toEqual({ from: "origin", to: "destination" });
    expect(findFlowColumns(["from city", "to city"])).toEqual({ from: "from city", to: "to city" });
    expect(findFlowColumns(["pickup_city", "dropoff_city"])).toEqual({ from: "pickup_city", to: "dropoff_city" });
    // two columns of cities with no sign of which way things go
    expect(findFlowColumns(["home_city", "work_city"])).toBeUndefined();
    expect(findFlowColumns(["origin_city"])).toBeUndefined();
    expect(findFlowColumns([])).toBeUndefined();
    // a name that says both is neither
    expect(findFlowColumns(["from_to_city", "destination_city"])).toBeUndefined();
  });

  it("adds up each pair of cities, leaves out a route from a city to itself, and passes the guard", async () => {
    const sql = await createSql();
    const rows = ["origin,destination,shipments"].concat(["London,Paris,5", "London,Paris,7", "Paris,London,2", "Berlin,Berlin,9", "Rome,Madrid,3"]);
    sql.load(rows.join("\n") + "\n");
    const chart = flowMapChart("origin", "destination", measure);
    expect(chart.type).toBe("flows");
    expect(guardSql(chart.query).ok).toBe(true);
    const result = sql.run(chart.query);
    const pairs = result.rows.map((r) => `${r[0]}>${r[1]}:${Number(r[2])}:${Number(r[3])}`).sort();
    // London to Paris is one route of 12 over 2 rows; Paris to London is its own; Berlin to Berlin is not a route
    expect(pairs).toEqual(["London>Paris:12:2", "Paris>London:2:1", "Rome>Madrid:3:1"]);
  });

  it("counts rows when there is no measure", async () => {
    const sql = await createSql();
    sql.load(["a,b", "x,y", "x,y", "y,x"].join("\n") + "\n");
    const rows = sql.run(flowMapChart("a", "b").query).rows;
    expect(rows.map((r) => `${r[0]}>${r[1]}:${Number(r[2])}`).sort()).toEqual(["x>y:2", "y>x:1"]);
  });

  it("drops a route with fewer than five rows from a published copy, so no single record is shown", () => {
    const rows = [{ x: "London", target: "Paris", y: 90, n: 12 }, { x: "Rome", target: "Madrid", y: 3, n: 2 }];
    expect(applyPrivacyFloor({ type: "flows" }, rows).map((r) => r.x)).toEqual(["London"]);
  });

  it("is described for a screen reader, saying which routes are drawn and which are not", () => {
    const spec = { ...flowMapChart("origin", "destination", measure), id: "f", layout: { x: 0, y: 0, w: 1, h: 1 } };
    const rows = [
      { x: "London", target: "Paris", y: 12, n: 3 },
      { x: "Paris", target: "London", y: 2, n: 1 },
      { x: "Smallville", target: "Paris", y: 4, n: 1 },
    ];
    const known = (v: unknown) => v !== "Smallville";
    const text = chartSummary(spec, rows, known);
    expect(text).toMatch(/^Flow map: /);
    expect(text).toContain("2 routes between 2 cities, biggest first: London to Paris 12 and Paris to London 2.");
    expect(text).toContain("1 other route has a place that is not a known city and is not shown.");
    expect(chartSummary(spec, [], known)).toMatch(/No data/);
    expect(chartSummary(spec, [{ x: "Smallville", target: "Nowhere", y: 1, n: 1 }], known)).toMatch(/nothing is drawn/);
  });

  it("is suggested for a table with an origin and a destination, and Pilot can name the two columns", () => {
    const text = (name: string, distinct = 40): ColumnProfile => ({ name, type: "string", nullCount: 0, distinct, textLength: 8 });
    const profile = { rowCount: 800, columns: [text("origin_city"), text("destination_city"), measure], flows: { from: "origin_city", to: "destination_city" } };
    const charts = suggestDashboard("x", profile).charts;
    const flow = charts.find((c) => c.type === "flows");
    expect(flow?.title).toBe("shipments from origin_city to destination_city");

    const table = { rowCount: 800, columns: [{ name: "origin_city", type: "string" as const, distinct: 40 }, { name: "destination_city", type: "string" as const, distinct: 38 }, { name: "shipments", type: "number" as const, distinct: 30 }] };
    const built = buildSpec(table, {
      title: "Routes",
      charts: [
        { type: "flows", title: "Routes", query: "", columns: ["origin_city", "destination_city", "shipments"] },
        { type: "flows", title: "Same column twice", query: "", columns: ["origin_city", "origin_city"] },
        { type: "flows", title: "Number as city", query: "", columns: ["origin_city", "shipments"] },
        { type: "bar", title: "Anything else", query: "", columns: ["origin_city"] },
      ],
    });
    expect(built.spec.charts.map((c) => c.type)).toEqual(["flows", "bar"]);
    expect(built.dropped.map((d) => d.reason)).toEqual(["a flow map needs two different columns", "a flow map needs two text columns of cities"]);
  });
});
