import { describe, expect, it } from "vitest";
import { chartSummary, said } from "../src/summary";

const spec = (type: "bar" | "line" | "area" | "pie" | "scatter" | "map" | "regions" | "kpi" | "table", title = "Revenue") => ({ type, title, x: "x", y: ["y"] });

describe("said", () => {
  it("reads numbers the way people say them", () => {
    expect(said(0.5234)).toBe("0.523");
    expect(said(42)).toBe("42");
    expect(said(1234.5)).toBe("1235");
    expect(said(12_345)).toBe("12.3 thousand");
    expect(said(1_234_567)).toBe("1.23 million");
    expect(said(3_400_000_000)).toBe("3.4 billion");
    expect(said(-250_000)).toBe("-250 thousand");
    expect(said(0)).toBe("0");
  });
});

describe("chartSummary", () => {
  it("describes a bar chart, highest first, and says how many more there are", () => {
    const rows = [
      { x: "East", y: 20_355 },
      { x: "South", y: 27_552 },
      { x: "North", y: 19_000 },
      { x: "West", y: 14_000 },
      { x: "Centre", y: 9_000 },
      { x: "Islands", y: 500 },
      { x: "Remote", y: 100 },
    ];
    expect(chartSummary(spec("bar", "Revenue by region"), rows)).toBe(
      "Bar chart: Revenue by region. 7 bars, highest first: South 27.6 thousand, East 20.4 thousand, North 19 thousand, West 14 thousand and Centre 9000, and 2 more.",
    );
  });

  it("uses singular words for one bar, and lists two without a comma", () => {
    expect(chartSummary(spec("bar", "Total"), [{ x: "All", y: 5 }])).toBe("Bar chart: Total. 1 bar, highest first: All 5.");
    expect(chartSummary(spec("bar", "Two"), [{ x: "a", y: 2 }, { x: "b", y: 1 }])).toBe("Bar chart: Two. 2 bars, highest first: a 2 and b 1.");
  });

  it("describes a pie chart as shares of the whole", () => {
    const rows = [{ x: "Web", y: 50 }, { x: "App", y: 30 }, { x: "Store", y: 20 }];
    expect(chartSummary(spec("pie", "Share of rows by channel"), rows)).toBe("Pie chart: Share of rows by channel. 3 slices, largest first: Web 50%, App 30% and Store 20%.");
  });

  it("describes a line: where it starts and ends, and its low and high with dates", () => {
    const rows = [
      { x: "2025-01-01T00:00:00.000Z", y: 100 },
      { x: "2025-02-01", y: 40 },
      { x: "2025-03-01", y: 180 },
      { x: "2025-04-01", y: 120 },
    ];
    expect(chartSummary(spec("line", "Revenue over time"), rows)).toBe(
      "Line chart: Revenue over time. 4 points from 2025-01-01 to 2025-04-01. It starts at 100 and ends higher, at 120. Lowest 40 on 2025-02-01, highest 180 on 2025-03-01.",
    );
    expect(chartSummary(spec("area", "Falling"), [{ x: "2025-01-01", y: 9 }, { x: "2025-02-01", y: 3 }])).toContain("ends lower, at 3");
    expect(chartSummary(spec("line", "Flat"), [{ x: "a", y: 5 }, { x: "b", y: 5 }])).toContain("ends where it started");
  });

  it("describes a scatter plot by how many points and the range of each axis", () => {
    const rows = [{ x: 1, y: 10 }, { x: 5, y: 40 }, { x: 3, y: 25 }];
    expect(chartSummary(spec("scatter", "Spend vs revenue"), rows)).toBe("Scatter plot: Spend vs revenue. 3 points. Across them x runs from 1 to 5 and y from 10 to 40.");
  });

  it("describes a map of bins by the area it covers and where it is busiest", () => {
    const rows = [{ x: 13.4, y: 52.5, n: 40 }, { x: 4.9, y: 52.4, n: 10 }, { x: 12.5, y: 41.9, n: 25 }];
    expect(chartSummary(spec("map", "Where the rows are"), rows)).toBe(
      "Map: Where the rows are. 3 areas with rows. Latitude runs from 41.9 to 52.5 and longitude from 4.9 to 13.4. Busiest area, near 52.5 latitude and 13.4 longitude, holds 40 of 75 rows.",
    );
    expect(chartSummary(spec("map", "Empty"), [])).toBe("Map: Empty. No data.");
    expect(chartSummary(spec("map", "One"), [{ x: 1, y: 2, n: 5 }])).toContain("1 area with rows");
  });

  it("describes a region map as places shaded, highest first", () => {
    const rows = [{ x: "France", y: 5 }, { x: "Spain", y: 9 }, { x: "Italy", y: 7 }];
    expect(chartSummary(spec("regions", "Rows by country"), rows)).toBe("Region map: Rows by country. 3 places shaded, highest first: Spain 9, Italy 7 and France 5.");
    expect(chartSummary(spec("regions", "Nothing"), [])).toBe("Region map: Nothing. No data.");
  });

  it("reads a headline number and a table", () => {
    expect(chartSummary(spec("kpi", "Total revenue"), [{ value: 120_825 }])).toBe("Headline number: Total revenue. 121 thousand.");
    expect(chartSummary(spec("kpi", "Empty"), [])).toBe("Headline number: Empty. No value.");
    expect(chartSummary(spec("table", "Data preview"), new Array(100).fill({}))).toBe("Table: Data preview. 100 rows shown.");
    expect(chartSummary(spec("table", "One"), [{}])).toBe("Table: One. 1 row shown.");
  });

  it("handles empty or unusable data without saying undefined or NaN", () => {
    for (const type of ["bar", "pie", "line", "area", "scatter"] as const) {
      expect(chartSummary(spec(type, "Nothing"), [])).toBe(`${type === "scatter" ? "Scatter plot" : type === "area" ? "Area chart" : type === "bar" ? "Bar chart" : type === "pie" ? "Pie chart" : "Line chart"}: Nothing. No data.`);
    }
    const messy = chartSummary(spec("bar", "Messy"), [{ x: null, y: "oops" }, { x: undefined, y: NaN }, { x: "ok", y: 3 }]);
    expect(messy).not.toMatch(/undefined|NaN|null/);
    expect(messy).toContain("ok 3");
  });

  it("uses the chart's own column names for x and y when it has them", () => {
    expect(chartSummary({ type: "bar", title: "Named", x: "region", y: ["total"] }, [{ region: "South", total: 7 }])).toBe("Bar chart: Named. 1 bar, highest first: South 7.");
  });

  it("does not let a negative slice distort the shares of a pie", () => {
    const s = chartSummary(spec("pie", "Odd"), [{ x: "a", y: 80 }, { x: "b", y: -50 }, { x: "c", y: 20 }]);
    expect(s).toContain("a 80%");
    expect(s).toContain("c 20%");
    expect(s).toContain("b 0%");
  });
});
