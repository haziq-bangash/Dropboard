import { describe, expect, it } from "vitest";
import { findInsights, type InsightInput } from "../src/insights";
import { range, seeded } from "./random";

const unusual = (extra: Partial<NonNullable<InsightInput["unusual"]>> = {}): NonNullable<InsightInput["unusual"]> => ({
  scored: 2000,
  flagged: 7,
  measures: ["amount", "discount"],
  considered: ["amount", "discount", "quantity"],
  top: [
    { id: 41, source: "isolated", score: 14, reasons: [{ measure: "amount", side: "high", z: 14.2 }], row: { order: 42, amount: 99999, discount: 3, region: "North" } },
    { id: 7, source: "joint", score: 22, reasons: [{ measure: "discount", side: "low", z: -5.1 }, { measure: "amount", side: "high", z: 4.4 }], row: { order: 8, amount: 5400, discount: 0, region: "East" } },
  ],
  ...extra,
});

describe("findings about unusual rows", () => {
  it("names how many, in plain words, with the rows and the reasons for a person to read", () => {
    const f = findInsights({ rowCount: 2000, unusual: unusual() }).find((x) => x.kind === "unusualrows")!;
    expect(f.sentence).toBe("7 of 2,000 rows (0.4%) stand out from the rest across 2 measures. The most unusual has unusually high amount.".replace("2,000", "2000"));
    expect(f.details!.columns.slice(0, 2)).toEqual(["Row", "Why"]);
    expect(f.details!.rows[0].slice(0, 2)).toEqual([42, "unusually high amount"]);
    expect(f.details!.rows[1][1]).toBe("unusually low discount and unusually high amount");
    // the rows' own values are in the details, which stay on screen and are never part of what is described to a model
    expect(JSON.stringify(f.details)).toContain("99999");
    expect(f.evidence).toEqual({ flagged: 7, scored: 2000, share: 0.0035, measures: 2, strongestZ: 14.2 });
    expect(JSON.stringify(f.evidence)).not.toContain("99999");
  });

  it("says nothing when no row is unusual, and replaces the lone-outlier finding when some are", () => {
    expect(findInsights({ rowCount: 2000, unusual: unusual({ flagged: 0, top: [] }) }).some((f) => f.kind === "unusualrows")).toBe(false);
    const withOutlier = findInsights({ rowCount: 2000, unusual: unusual(), numeric: [{ column: "amount", values: [...range(1999).map((i) => 40 + (i % 7)), 9000] }] });
    expect(withOutlier.some((f) => f.kind === "outlier")).toBe(false);
    expect(withOutlier.some((f) => f.kind === "unusualrows")).toBe(true);
  });
});

describe("findings about points that break their pattern", () => {
  const month = (i: number) => Date.UTC(2018, i, 1);
  const series = (spike: number | null) => {
    const r = seeded(3);
    const y = range(72).map((i) => 1000 * (1 + i * 0.01) * ((i % 12) === 11 ? 1.6 : 1) * (1 + r.normal() * 0.03));
    if (spike !== null) y[spike] *= 0.35;
    return { column: "sales", x: range(72).map(month), y, labels: range(72).map((i) => `month ${i + 1}`), unit: "month" as const };
  };

  it("finds the month that broke the pattern, and says it relative to trend and season", () => {
    const f = findInsights({ rowCount: 500, series: [series(40)] }, { limit: 30 }).find((x) => x.kind === "contextual")!;
    expect(f.evidence.at).toBe("month 41");
    expect(f.sentence).toMatch(/^sales in month 41 was 6\d% below what its trend and season predict \(/);
  });

  it("finds nothing in a series that follows its pattern, including a December peak every year", () => {
    expect(findInsights({ rowCount: 500, series: [series(null)] }, { limit: 30 }).some((x) => x.kind === "contextual")).toBe(false);
  });

  it("is quiet about a measure whose odd points are the same rows already listed as unusual", () => {
    const s = series(40);
    const covered = findInsights({ rowCount: 500, series: [s], unusual: unusual({ considered: ["sales"] }) }, { limit: 30 });
    expect(covered.some((x) => x.kind === "contextual")).toBe(false);
  });

  it("says a huge departure as a multiple, not as a four-digit percent", () => {
    const s = series(null);
    s.y[30] *= 40;
    const f = findInsights({ rowCount: 500, series: [s] }, { limit: 30 }).find((x) => x.kind === "contextual")!;
    expect(f.sentence).toMatch(/was about \d+ times what its trend and season predict/);
  });
});
