import { describe, expect, it } from "vitest";
import { findInsights, type Finding, type InsightInput } from "../src/insights";
import { range, seeded } from "./random";

type Rng = ReturnType<typeof seeded>;

/** A table with no structure at all: independent noise everywhere, even category counts, a few random gaps. */
function noiseTable(seed: number, opts: { walk?: boolean } = {}): InsightInput {
  const r = seeded(seed);
  const rows = 500;
  const series = range(3).map((k) => {
    const n = 60 + r.int(0, 60);
    let level = 0;
    return {
      column: `measure_${k}`,
      x: range(n),
      y: range(n).map(() => (opts.walk ? (level += r.normal()) + 100 : 100 + r.normal() * 10)),
      labels: range(n).map((i) => `week ${i + 1}`),
    };
  });
  const numeric = range(8).map((k) => ({ column: `value_${k}`, values: range(rows).map(() => r.normal() * 10 + 50) }));
  const categories = range(3).map((k) => {
    const labels = range(4 + r.int(0, 4)).map((i) => `c${i}`);
    const counts = labels.map(() => 0);
    for (let i = 0; i < rows; i++) counts[r.int(0, labels.length - 1)]++;
    return { column: `category_${k}`, counts: labels.map((label, i) => ({ label, count: counts[i] })) };
  });
  const missing = range(3).map((k) => ({ column: `value_${k}`, nullCount: r.int(0, 15) }));
  return { rowCount: rows, series, numeric, categories, missing };
}

/** The same kind of table with five things planted in it. */
function plantedTable(seed: number) {
  const r: Rng = seeded(seed);
  const rows = 500;
  const n = 100;
  const x = range(n);
  const labels = range(n).map((i) => `week ${i + 1}`);

  const base = noiseTable(seed + 7777);
  const input: InsightInput = { ...base, rowCount: rows };

  // 1. a fall of about half over the period
  const falling = { column: "revenue", x, y: x.map((i) => 200 - i * 1.0 + r.normal() * 6), labels };
  // 2. a step up at week 60
  const stepping = { column: "signups", x, y: x.map((i) => (i < 60 ? 100 : 170) + r.normal() * 6), labels };
  input.series = [falling, stepping, ...(base.series ?? [])];

  // 3. two columns that move together, 4. one wildly wrong value
  const a = range(rows).map(() => r.normal());
  const together = { column: "ad_spend", values: a.map((v) => 100 + v * 20) };
  const follows = { column: "orders", values: a.map((v) => 50 + v * 9 + r.normal() * 5) };
  const wrong = { column: "refund", values: range(rows).map((i) => (i === 17 ? 9000 : 40 + r.normal() * 4)) };
  input.numeric = [together, follows, wrong, ...(base.numeric ?? [])];

  // 5. one category holds most rows, and a column that is mostly empty
  input.categories = [{ column: "region", counts: [{ label: "South", count: 350 }, { label: "North", count: 60 }, { label: "East", count: 50 }, { label: "West", count: 40 }] }, ...(base.categories ?? [])];
  input.missing = [{ column: "phone", nullCount: 180 }, ...(base.missing ?? [])];
  return input;
}

const has = (found: Finding[], kind: Finding["kind"], column: string) => found.some((f) => f.kind === kind && f.columns.includes(column));

describe("a table with nothing in it", () => {
  it("almost never produces a finding (false discovery control)", () => {
    const trials = 300;
    let withFindings = 0;
    for (let seed = 0; seed < trials; seed++) {
      if (findInsights(noiseTable(seed)).length > 0) withFindings++;
    }
    // Benjamini-Hochberg at 5% means at most about 5% of all-noise tables get a finding, and the effect floors cut that further
    expect(withFindings / trials).toBeLessThanOrEqual(0.05);
  });

  it("does not invent level changes in slowly drifting series, and calls few of them trends", () => {
    // A random walk really does wander, so some count as trends; the aim is that most do not, and none gets a "step".
    let series = 0;
    let trends = 0;
    let changes = 0;
    for (let seed = 0; seed < 200; seed++) {
      const found = findInsights(noiseTable(40000 + seed, { walk: true }));
      series += 3;
      trends += found.filter((f) => f.kind === "trend").length;
      changes += found.filter((f) => f.kind === "change").length;
    }
    expect(trends / series).toBeLessThan(0.25);
    expect(changes / series).toBeLessThan(0.02);
  });
});

describe("a table with things planted in it", () => {
  const trials = 60;
  const runs = range(trials).map((seed) => findInsights(plantedTable(seed), { limit: 50 }));

  it("finds every planted thing, every time, except a step a little less often", () => {
    for (const found of runs) {
      expect(has(found, "trend", "revenue")).toBe(true);
      expect(found.some((f) => f.kind === "correlation" && f.columns.includes("ad_spend") && f.columns.includes("orders"))).toBe(true);
      expect(has(found, "outlier", "refund")).toBe(true);
      expect(has(found, "dominance", "region")).toBe(true);
      expect(has(found, "missing", "phone")).toBe(true);
    }
  });

  it("finds a planted step almost every time, and never reports a steady slope as a step", () => {
    const hits = runs.filter((found) => has(found, "change", "signups")).length;
    expect(hits / trials).toBeGreaterThanOrEqual(0.9);
    for (const found of runs) expect(has(found, "change", "revenue")).toBe(false);
  });

  it("says a step as a step, not also as a trend, in nearly every case", () => {
    const both = runs.filter((found) => has(found, "trend", "signups") && has(found, "change", "signups")).length;
    expect(both / trials).toBeLessThan(0.1);
  });

  it("adds almost nothing that was not planted", () => {
    const planted = new Set(["revenue", "signups", "ad_spend", "orders", "refund", "region", "phone"]);
    let extras = 0;
    for (const found of runs) extras += found.filter((f) => !f.columns.every((c) => planted.has(c))).length;
    expect(extras / trials).toBeLessThan(0.15);
  });

  it("describes them in plain, accurate words with the numbers behind them", () => {
    // a run where the step was found, so its sentence can be checked
    const found = runs.find((f) => has(f, "change", "signups"))!;
    const trend = found.find((f) => f.kind === "trend" && f.columns[0] === "revenue")!;
    expect(trend.sentence).toMatch(/^revenue fell about \d+% from start to end\.$/);
    expect(trend.evidence.relativeChange).toBeLessThan(-0.3);

    const step = found.find((f) => f.kind === "change" && f.columns[0] === "signups")!;
    expect(step.sentence).toMatch(/signups stepped up from about (9\d|10\d) to (16\d|17\d) \(\+\d+%\) around week 6\d\./);

    const dom = found.find((f) => f.kind === "dominance")!;
    expect(dom.sentence).toBe("South makes up 70% of region, about 2.8 times an even split.");

    const out = found.find((f) => f.kind === "outlier")!;
    expect(out.sentence).toMatch(/^One value in refund sits far outside the usual range, up to \d+ times the typical spread away \(9000\)\.$/);

    const missing = found.find((f) => f.kind === "missing" && f.columns[0] === "phone")!;
    expect(missing.sentence).toBe("36% of phone is empty.");
  });

  it("ranks the strongest first and respects the limit", () => {
    const found = findInsights(plantedTable(3), { limit: 3 });
    expect(found).toHaveLength(3);
    for (let i = 1; i < found.length; i++) expect(found[i - 1].strength).toBeGreaterThanOrEqual(found[i].strength);
    for (const f of found) {
      expect(f.strength).toBeGreaterThan(0);
      expect(f.strength).toBeLessThanOrEqual(1);
    }
  });
});

describe("edge cases", () => {
  it("returns nothing for an empty or tiny summary", () => {
    expect(findInsights({ rowCount: 0 })).toEqual([]);
    expect(findInsights({ rowCount: 5, series: [{ column: "a", x: [0, 1, 2], y: [1, 2, 3] }], numeric: [{ column: "b", values: [1, 2, 3] }] })).toEqual([]);
  });

  it("does not call a big effect real when the test says it could be chance", () => {
    // 12 points with a loud swing but no pattern: the effect looks large, the evidence is not there
    const y = [100, 40, 160, 50, 150, 30, 170, 60, 140, 20, 180, 70];
    expect(findInsights({ rowCount: 12, series: [{ column: "noisy", x: range(12), y }] }).filter((f) => f.kind === "trend")).toEqual([]);
  });

  it("does not report a real but tiny effect on a huge table", () => {
    const r = seeded(77);
    const x = range(20000).map(() => r.normal());
    const y = x.map((v) => 0.05 * v + r.normal()); // r about 0.05: significant at this size, irrelevant in practice
    const found = findInsights({ rowCount: 20000, numeric: [{ column: "x", values: x }, { column: "y", values: y }] });
    expect(found.filter((f) => f.kind === "correlation")).toEqual([]);
  });
});
