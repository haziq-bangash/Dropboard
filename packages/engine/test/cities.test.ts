import { describe, expect, it } from "vitest";
import { createCityIndex, detectCityColumn, normalizePlace, type CityRow } from "../src/cities";
import { addCityChart, cityColumnChoices } from "../src/edit";
import { chartSummary } from "../src/summary";
import { applyPrivacyFloor, citiesChart, suggestDashboard } from "../src/suggest";
import type { TableProfile } from "../src/profile";

const rows: CityRow[] = [
  ["Paris", "", "FR", 48.86, 2.35],
  ["Sao Paulo", "São Paulo", "BR", -23.55, -46.63],
  ["Springfield", "", "US", 39.8, -89.64],
  ["Springfield", "", "AU", -27.6, 152.9],
  ["Munich", "München", "DE", 48.14, 11.58],
];
const index = createCityIndex(rows);

describe("city names", () => {
  it("ignores case, accents, punctuation and a trailing region", () => {
    expect(normalizePlace("  São  Paulo, SP ")).toBe("sao paulo");
    expect(normalizePlace("Washington (DC)")).toBe("washington");
    expect(index.find("PARIS")?.country).toBe("FR");
    expect(index.find("São Paulo")?.lat).toBeCloseTo(-23.55);
    expect(index.find("Sao Paulo, Brazil")?.country).toBe("BR");
    expect(index.find("München")?.name).toBe("Munich");
    expect(index.find("Atlantis")).toBeNull();
    expect(index.find(42)).toBeNull();
    expect(index.find("")).toBeNull();
  });
  it("takes the biggest city when a name repeats, since the list is biggest first", () => {
    expect(index.find("Springfield")?.country).toBe("US");
  });
});

describe("detectCityColumn", () => {
  const values = ["Paris", "Munich", "Sao Paulo", "Springfield", "Nowhereville"];
  it("needs a place-like column name and four fifths of the values to be known cities", () => {
    expect(detectCityColumn("city", values, 5, index)).toEqual({ column: "city", confidence: 0.8 });
    expect(detectCityColumn("Delivery city", values, 5, index)?.column).toBe("Delivery city");
    expect(detectCityColumn("name", values, 5, index)).toBeNull();
    expect(detectCityColumn("city", ["Paris", "Nowhereville", "Atlantis", "Gondor"], 4, index)).toBeNull();
  });
  it("skips columns with one value or too many, or only blanks", () => {
    expect(detectCityColumn("city", ["Paris"], 1, index)).toBeNull();
    expect(detectCityColumn("city", values, 5000, index)).toBeNull();
    expect(detectCityColumn("city", ["", null], 3, index)).toBeNull();
  });
});

describe("a city map", () => {
  const profile: TableProfile = {
    rowCount: 900,
    columns: [
      { name: "city", type: "string", nullCount: 0, distinct: 40 },
      { name: "customer", type: "string", nullCount: 0, distinct: 800 },
      { name: "revenue", type: "number", nullCount: 0, distinct: 700 },
    ],
  };

  it("is suggested when the profile has a city column, and described with how many are not cities", () => {
    expect(suggestDashboard("t", profile).charts.some((c) => c.type === "cities")).toBe(false);
    const spec = suggestDashboard("t", { ...profile, cities: "city" });
    const chart = spec.charts.find((c) => c.type === "cities")!;
    expect(chart.query).toContain('"city" AS x');
    const data = [{ x: "Paris", y: 90, n: 30 }, { x: "Munich", y: 40, n: 12 }, { x: "Nowhereville", y: 5, n: 2 }];
    const summary = chartSummary(chart, data, (v) => index.find(v) !== null);
    expect(summary).toBe(`City map: ${chart.title}. 2 cities drawn, biggest first: Paris 90 and Munich 40. 1 other value is not a known city and is not shown.`);
    expect(chartSummary(chart, data, () => false)).toMatch(/nothing is drawn/);
  });

  it("leaves out cities with fewer than five rows from a published copy", () => {
    const data = [{ x: "Paris", n: 30 }, { x: "Munich", n: 4 }];
    expect(applyPrivacyFloor({ type: "cities" }, data).map((r) => r.x)).toEqual(["Paris"]);
  });

  it("can be added by hand for a column the detector did not recognise", () => {
    const spec = suggestDashboard("t", profile);
    expect(cityColumnChoices(profile).map((c) => c.name)).toEqual(["city", "customer"]);
    const out = addCityChart(spec, profile, "city") as typeof spec;
    expect(out.charts.find((c) => c.type === "cities")!.title).toBe("revenue by city");
    expect(addCityChart(out, profile, "city")).toMatch(/already mapped/);
    expect(addCityChart(spec, profile, "revenue")).toMatch(/not a text column/);
    expect(citiesChart("city").title).toBe("Rows by city");
  });
});
