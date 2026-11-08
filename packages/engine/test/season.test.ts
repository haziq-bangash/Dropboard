import { describe, expect, it } from "vitest";
import { findInsights, type InsightInput } from "../src/insights";
import { latestChange, seasonality } from "../src/stats/season";
import { range, seeded } from "./random";

const MONTH_MS = (i: number) => Date.UTC(2021, i, 1);
const phasesOf = (n: number) => range(n).map((i) => new Date(MONTH_MS(i)).getUTCMonth());

/** Monthly sales with a clear December peak and a July dip, rising a little, with noise. */
function seasonal(seed: number, n = 48) {
  const r = seeded(seed);
  return range(n).map((i) => {
    const m = new Date(MONTH_MS(i)).getUTCMonth();
    return 1000 + i * 4 + (m === 11 ? 400 : 0) + (m === 6 ? -250 : 0) + r.normal() * 40;
  });
}

describe("seasonality", () => {
  it("finds a yearly pattern and names the high and low month", () => {
    const s = seasonality(seasonal(1), phasesOf(48), 12)!;
    expect(s.p).toBeLessThan(0.001);
    expect(s.strength).toBeGreaterThan(0.7);
    expect(s.peak).toBe(11);
    expect(s.low).toBe(6);
    expect(s.amplitude).toBeGreaterThan(0.4);
  });

  it("finds a weekly pattern in daily numbers", () => {
    const r = seeded(2);
    const y = range(70).map((i) => 200 + (i % 7 === 6 || i % 7 === 0 ? 120 : 0) + r.normal() * 10);
    const phases = range(70).map((i) => i % 7);
    const s = seasonality(y, phases, 7)!;
    expect(s.p).toBeLessThan(0.001);
    expect(s.strength).toBeGreaterThan(0.7);
  });

  it("needs two whole cycles", () => {
    expect(seasonality(seasonal(3, 20), phasesOf(20), 12)).toBeNull();
  });

  it("finds little in plain noise, and in a steady climb", () => {
    let strong = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = seeded(100 + seed);
      const y = range(48).map(() => 100 + r.normal() * 10);
      const s = seasonality(y, phasesOf(48), 12);
      // strength alone is a weak test (with three or four points a month, noise fits a pattern too easily), so the rule
      // the engine applies is strength, the chance of seeing it by accident, and a minimum size together
      if (s && s.strength >= 0.5 && s.p < 0.05 && Math.abs(s.amplitude) >= 0.15) strong++;
    }
    // a little above the 5% a p-value promises, because taking out the trend with a moving average makes neighbouring
    // points slightly related; the correction across findings and the findings-level noise test below keep this in check
    expect(strong / 200).toBeLessThan(0.1);
    const climb = range(48).map((i) => 100 + i * 5);
    const s = seasonality(climb, phasesOf(48), 12);
    expect(s === null || s.strength < 0.5 || s.amplitude < 0.15).toBe(true);
  });
});

describe("latestChange", () => {
  it("flags a latest period that jumps far beyond usual moves", () => {
    const r = seeded(4);
    const y = range(30).map(() => 100 + r.normal() * 4);
    y[29] = 150;
    const l = latestChange(y)!;
    expect(l.relativeChange).toBeGreaterThan(0.3);
    expect(Math.abs(l.z)).toBeGreaterThan(5);
    expect(l.p).toBeLessThan(0.001);
  });

  it("does not flag steady growth for growing, or a series too short to know", () => {
    const climb = range(30).map((i) => 100 + i * 5);
    expect(latestChange(climb)).toBeNull(); // no spread in the moves, so nothing to compare with
    const r = seeded(5);
    const noisyClimb = range(30).map((i) => 100 + i * 5 + r.normal() * 2);
    const l = latestChange(noisyClimb);
    expect(l === null || Math.abs(l.z) < 3).toBe(true);
    expect(latestChange([1, 2, 3])).toBeNull();
  });
});

describe("findings from a monthly series", () => {
  const monthly = (y: number[], column = "revenue"): InsightInput => ({
    rowCount: 1000,
    series: [{ column, x: y.map((_, i) => MONTH_MS(i)), y, labels: y.map((_, i) => `month ${i + 1}`), unit: "month" }],
  });

  it("reports a yearly pattern with its high and low month, and says it once", () => {
    const found = findInsights(monthly(seasonal(6)));
    const f = found.find((x) => x.kind === "seasonal")!;
    expect(f).toBeTruthy();
    expect(f.evidence.peak).toBe("December");
    expect(f.evidence.low).toBe("July");
    expect(f.sentence).toContain("yearly pattern");
    expect(found.filter((x) => x.kind === "seasonal")).toHaveLength(1);
  });

  it("reports an unusual latest month, but not when a pattern already explains the high or low", () => {
    const r = seeded(7);
    const y = range(36).map(() => 100 + r.normal() * 4);
    y[35] = 160;
    const found = findInsights(monthly(y));
    const f = found.find((x) => x.kind === "latest")!;
    expect(f.evidence.at).toBe("month 36");
    expect(f.headline).toContain("jumped");
    // the December peak of a seasonal series is not "unusual" in its latest month
    const withSeason = seasonal(8, 48);
    expect(findInsights(monthly(withSeason)).some((x) => x.kind === "latest")).toBe(false);
  });

  it("almost never reports a pattern or a latest move in noise", () => {
    let tables = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = seeded(9000 + seed);
      const y = range(48).map(() => 100 + r.normal() * 10);
      const found = findInsights(monthly(y));
      if (found.some((x) => x.kind === "seasonal" || x.kind === "latest")) tables++;
    }
    expect(tables / 300).toBeLessThanOrEqual(0.03);
  }, 60_000);
});

describe("repeated rows", () => {
  const withCopies = (rows: number): InsightInput => ({ rowCount: 1000, duplicates: { rows } });
  it("reports exact copies once they are a few percent of the rows", () => {
    const f = findInsights(withCopies(50)).find((x) => x.kind === "duplicates")!;
    expect(f.sentence).toBe("50 rows (5%) are exact copies of another row.");
    expect(f.evidence).toEqual({ duplicateRows: 50, share: 0.05 });
  });
  it("stays quiet about a stray repeat or two", () => {
    expect(findInsights(withCopies(1)).some((x) => x.kind === "duplicates")).toBe(false);
    expect(findInsights(withCopies(15)).some((x) => x.kind === "duplicates")).toBe(false);
  });
});
