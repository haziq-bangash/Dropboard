import { describe, expect, it } from "vitest";
import { addPlaceChart, placeColumnChoices, removeChart } from "../src/edit";
import { suggestDashboard } from "../src/suggest";
import type { TableProfile } from "../src/profile";

const profile: TableProfile = {
  rowCount: 500,
  columns: [
    { name: "origin", type: "string", nullCount: 0, distinct: 12 },
    { name: "destination", type: "string", nullCount: 0, distinct: 400 },
    { name: "revenue", type: "number", nullCount: 0, distinct: 480 },
    { name: "note", type: "string", nullCount: 0, distinct: 1 },
  ],
};

describe("placeColumnChoices", () => {
  it("offers text columns with a plausible number of places", () => {
    expect(placeColumnChoices(profile).map((c) => c.name)).toEqual(["origin"]);
  });
});

describe("removeChart", () => {
  const spec = suggestDashboard("t", profile);
  it("takes the named chart off and leaves the rest", () => {
    const id = spec.charts[1].id;
    const out = removeChart(spec, id);
    expect(out.charts.map((c) => c.id)).not.toContain(id);
    expect(out.charts).toHaveLength(spec.charts.length - 1);
  });
  it("ignores an unknown id, and never removes the last chart", () => {
    expect(removeChart(spec, "nope")).toBe(spec);
    const one = { ...spec, charts: [spec.charts[0]] };
    expect(removeChart(one, one.charts[0].id)).toBe(one);
  });
});

describe("addPlaceChart", () => {
  const spec = suggestDashboard("t", profile);

  it("adds a world map shaded by the first measure, with a fresh id", () => {
    const out = addPlaceChart(spec, profile, "country", "origin");
    expect(typeof out).not.toBe("string");
    const charts = (out as typeof spec).charts;
    expect(charts.at(-1)!.type).toBe("table"); // the data preview stays last
    const added = charts.at(-2)!;
    expect(added.type).toBe("regions");
    expect(added.query).toContain('"origin" AS x');
    expect(added.query).toContain("revenue");
    expect(added.map).toBeUndefined();
    expect(new Set((out as typeof spec).charts.map((c) => c.id)).size).toBe((out as typeof spec).charts.length);
  });

  it("adds a US map when the column holds states", () => {
    const out = addPlaceChart(spec, profile, "us-state", "origin") as typeof spec;
    expect(out.charts.find((c) => c.type === "regions")!.map).toBe("us");
  });

  it("says why it cannot, instead of adding something wrong", () => {
    expect(addPlaceChart(spec, profile, "country", "revenue")).toMatch(/not a text column/);
    expect(addPlaceChart(spec, profile, "country", "ghost")).toMatch(/not a text column/);
    expect(addPlaceChart(spec, profile, "country", "destination")).toMatch(/too many/);
  });

  it("does not add the same map twice", () => {
    const once = addPlaceChart(spec, profile, "country", "origin") as typeof spec;
    expect(addPlaceChart(once, profile, "country", "origin")).toMatch(/already mapped/);
  });
});

describe("addRequestedChart", () => {
  const rich: TableProfile = {
    rowCount: 800,
    columns: [
      { name: "region", type: "string", nullCount: 0, distinct: 4 },
      { name: "channel", type: "string", nullCount: 0, distinct: 6 },
      { name: "customer", type: "string", nullCount: 0, distinct: 700 },
      { name: "revenue", type: "number", nullCount: 0, distinct: 600 },
      { name: "lat", type: "number", nullCount: 0, distinct: 700 },
      { name: "lng", type: "number", nullCount: 0, distinct: 700 },
    ],
    coordinates: { lat: "lat", lon: "lng" },
  };
  const spec = suggestDashboard("t", rich);

  it("offers only columns that suit the chart, and never a latitude as an amount", async () => {
    const { textChoices, measureChoices } = await import("../src/edit");
    expect(textChoices(rich, "funnel").map((c) => c.name)).toEqual(["region", "channel"]);
    expect(textChoices(rich, "treemap").map((c) => c.name)).toEqual(["region", "channel"]);
    expect(measureChoices(rich).map((c) => c.name)).toEqual(["revenue"]);
  });

  it("adds a treemap, a funnel and a flow diagram above the data preview", async () => {
    const { addRequestedChart } = await import("../src/edit");
    const withTreemap = addRequestedChart(spec, rich, { type: "treemap", category: "region", child: "channel", measure: "revenue" }) as typeof spec;
    expect(withTreemap.charts.at(-1)!.type).toBe("table");
    expect(withTreemap.charts.at(-2)!.type).toBe("treemap");
    const withFunnel = addRequestedChart(withTreemap, rich, { type: "funnel", stage: "channel" }) as typeof spec;
    const withFlow = addRequestedChart(withFunnel, rich, { type: "sankey", from: "region", to: "channel", measure: "revenue" }) as typeof spec;
    expect(withFlow.charts.map((c) => c.type).filter((t) => ["treemap", "funnel", "sankey"].includes(t))).toEqual(["treemap", "funnel", "sankey"]);
    expect(new Set(withFlow.charts.map((c) => c.id)).size).toBe(withFlow.charts.length);
  });

  it("says why not, and does not add the same chart twice", async () => {
    const { addRequestedChart } = await import("../src/edit");
    expect(addRequestedChart(spec, rich, { type: "funnel", stage: "customer" })).toMatch(/too many different values/);
    expect(addRequestedChart(spec, rich, { type: "funnel", stage: "revenue" })).toMatch(/Choose a text column/);
    expect(addRequestedChart(spec, rich, { type: "sankey", from: "region", to: "region" })).toMatch(/two different columns/);
    expect(addRequestedChart(spec, rich, { type: "treemap", category: "region", measure: "region" })).toMatch(/not a number column/);
    const once = addRequestedChart(spec, rich, { type: "funnel", stage: "region" }) as typeof spec;
    expect(addRequestedChart(once, rich, { type: "funnel", stage: "region" })).toMatch(/already on this dashboard/);
  });
});
