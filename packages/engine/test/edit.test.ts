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
