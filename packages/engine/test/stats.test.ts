import { describe, expect, it } from "vitest";
import { benjaminiHochberg, changePoint, dominance, mannKendall, mean, median, outliers, pearson, pelt, scaledMad } from "../src/stats/tests";
import { range, seeded } from "./random";

describe("basics", () => {
  it("median and robust spread", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNaN();
    expect(mean([2, 4, 6])).toBe(4);
    // for standard normal data the scaled MAD is close to 1
    const r = seeded(1);
    expect(scaledMad(range(5000).map(() => r.normal()))).toBeCloseTo(1, 1);
  });
});

describe("Benjamini-Hochberg", () => {
  it("keeps the discoveries up to the largest p under its line", () => {
    expect(benjaminiHochberg([0.01, 0.04, 0.03, 0.005], 0.05)).toEqual([true, true, true, true]);
    expect(benjaminiHochberg([0.2, 0.3, 0.9], 0.05)).toEqual([false, false, false]);
    // 0.04 alone would pass a plain 5% cut, but among 4 tests it is above its line (4/4 * 0.05 = 0.05 only for the largest)
    expect(benjaminiHochberg([0.001, 0.2, 0.3, 0.6], 0.05)).toEqual([true, false, false, false]);
    expect(benjaminiHochberg([], 0.05)).toEqual([]);
  });
});

describe("trend", () => {
  const t = range(60);
  it("finds a rising trend, its size and its direction", () => {
    const r = seeded(2);
    const y = t.map((i) => 100 + i * 2 + r.normal() * 5);
    const m = mannKendall(t, y)!;
    expect(m.p).toBeLessThan(1e-6);
    expect(m.slope).toBeGreaterThan(1.7);
    expect(m.slope).toBeLessThan(2.3);
    // 100 -> about 218 over the 59 steps
    expect(m.relativeChange).toBeGreaterThan(1);
  });

  it("finds a falling trend", () => {
    const r = seeded(3);
    const m = mannKendall(t, t.map((i) => 200 - i * 1.5 + r.normal() * 4))!;
    expect(m.p).toBeLessThan(1e-6);
    expect(m.slope).toBeLessThan(0);
    expect(m.relativeChange).toBeLessThan(-0.3);
  });

  it("sees nothing in plain noise or a flat series", () => {
    const r = seeded(4);
    expect(mannKendall(t, t.map(() => 50 + r.normal() * 5))!.p).toBeGreaterThan(0.05);
    const flat = mannKendall(t, t.map(() => 7))!;
    expect(flat.p).toBeCloseTo(1, 6);
    expect(flat.slope).toBe(0);
  });

  it("needs enough points, and the same number of x and y", () => {
    expect(mannKendall([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(mannKendall(t, t.slice(1))).toBeNull();
  });

  it("is cautious with series that drift slowly, like a random walk", () => {
    // a plain test calls most random walks trends; the serial-correlation adjustment should call far fewer
    let called = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = seeded(1000 + seed);
      let level = 0;
      const walk = t.map(() => (level += r.normal()));
      if (mannKendall(t, walk)!.p < 0.01) called++;
    }
    expect(called / 200).toBeLessThan(0.3);
  });

  it("is calibrated on noise: about 5% of noise series test below 0.05", () => {
    let below = 0;
    for (let seed = 0; seed < 400; seed++) {
      const r = seeded(5000 + seed);
      if (mannKendall(t, t.map(() => r.normal()))!.p < 0.05) below++;
    }
    expect(below / 400).toBeGreaterThan(0.01);
    expect(below / 400).toBeLessThan(0.1);
  });
});

describe("correlation", () => {
  it("reports a strong relationship", () => {
    const r = seeded(6);
    const a = range(100).map(() => r.normal());
    const b = a.map((v) => 2 * v + r.normal() * 0.5);
    const c = pearson(a, b)!;
    expect(c.r).toBeGreaterThan(0.9);
    expect(c.p).toBeLessThan(1e-10);
    expect(c.n).toBe(100);
  });

  it("reports a perfect negative one", () => {
    const a = range(20);
    expect(pearson(a, a.map((v) => -v))!.r).toBeCloseTo(-1, 10);
  });

  it("finds nothing between unrelated columns", () => {
    const r = seeded(7);
    const c = pearson(range(200).map(() => r.normal()), range(200).map(() => r.normal()))!;
    expect(Math.abs(c.r)).toBeLessThan(0.2);
  });

  it("skips rows with a missing value, and gives up on too few or constant data", () => {
    const a = [1, 2, null, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const b = [2, 4, 6, null, 10, 12, 14, 16, 18, 20, 22, 24];
    expect(pearson(a, b)!.n).toBe(10);
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(pearson(range(30).map(() => 5), range(30))).toBeNull();
  });
});

describe("dominance", () => {
  it("finds one category far above an even split", () => {
    const d = dominance([{ label: "MS", count: 900 }, { label: "CA", count: 50 }, { label: "IN", count: 50 }])!;
    expect(d.label).toBe("MS");
    expect(d.share).toBeCloseTo(0.9, 5);
    expect(d.times).toBeCloseTo(2.7, 5);
    expect(d.p).toBeLessThan(1e-10);
  });

  it("sees an even split as even", () => {
    const d = dominance([{ label: "a", count: 100 }, { label: "b", count: 98 }, { label: "c", count: 102 }])!;
    expect(d.p).toBeGreaterThan(0.9);
  });

  it("needs two categories and enough rows", () => {
    expect(dominance([{ label: "a", count: 100 }])).toBeNull();
    expect(dominance([{ label: "a", count: 5 }, { label: "b", count: 5 }])).toBeNull();
  });
});

describe("outliers", () => {
  it("flags a value far outside, even a huge one that inflates the plain standard deviation", () => {
    const r = seeded(8);
    const v = range(500).map(() => 100 + r.normal() * 5);
    v.push(100000);
    const o = outliers(v)!;
    expect(o.count).toBe(1);
    expect(o.worst.value).toBe(100000);
    expect(o.worst.score).toBeGreaterThan(1000);
  });

  it("flags nothing in ordinary noise", () => {
    let flagged = 0;
    for (let seed = 0; seed < 100; seed++) {
      const r = seeded(9000 + seed);
      if (outliers(range(2000).map(() => r.normal()))) flagged++;
    }
    expect(flagged).toBeLessThanOrEqual(1);
  });

  it("needs enough values, and some spread", () => {
    expect(outliers([1, 2, 3])).toBeNull();
    expect(outliers(range(100).map(() => 4))).toBeNull();
  });
});

describe("change point", () => {
  it("finds a clear step and where it happens", () => {
    const r = seeded(10);
    const y = range(100).map((i) => (i < 60 ? 50 : 80) + r.normal() * 5);
    const c = changePoint(y)!;
    expect(Math.abs(c.index - 60)).toBeLessThanOrEqual(2);
    expect(c.before).toBeCloseTo(50, -1);
    expect(c.after).toBeCloseTo(80, -1);
    expect(c.shift).toBeGreaterThan(4);
    expect(c.relativeChange).toBeCloseTo(0.6, 1);
  });

  it("finds a drop too", () => {
    const r = seeded(11);
    const c = changePoint(range(80).map((i) => (i < 30 ? 200 : 120) + r.normal() * 6))!;
    expect(Math.abs(c.index - 30)).toBeLessThanOrEqual(2);
    expect(c.relativeChange).toBeLessThan(-0.3);
  });

  it("reports nothing for plain noise", () => {
    let found = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = seeded(20000 + seed);
      if (changePoint(range(100).map(() => 50 + r.normal() * 5))) found++;
    }
    expect(found).toBeLessThanOrEqual(4);
  });

  it("rarely calls a random walk a change, because it wanders inside its levels", () => {
    let found = 0;
    for (let seed = 0; seed < 300; seed++) {
      const w = seeded(60000 + seed);
      let level = 0;
      if (changePoint(range(100).map(() => (level += w.normal())))) found++;
    }
    expect(found / 300).toBeLessThan(0.2);
  });

  it("still finds a step that is only a few noise units", () => {
    let found = 0;
    for (let seed = 0; seed < 100; seed++) {
      const r = seeded(70000 + seed);
      const c = changePoint(range(100).map((i) => (i < 50 ? 0 : 5) + r.normal() * 1));
      if (c && Math.abs(c.index - 50) <= 2) found++;
    }
    expect(found / 100).toBeGreaterThan(0.9);
  });

  it("ignores a shift too small to trust, and series that are too short or flat", () => {
    const r = seeded(12);
    expect(changePoint(range(100).map((i) => (i < 50 ? 50 : 52) + r.normal() * 5))).toBeNull();
    expect(changePoint(range(10).map((i) => i))).toBeNull();
    expect(changePoint(range(100).map(() => 3))).toBeNull();
  });
});

describe("PELT against an exhaustive search", () => {
  // the plain O(n^2) dynamic programme over every possible start, with the same penalty and minimum stretch
  function exhaustive(y: number[], penalty: number, minSegment: number): number[] {
    const n = y.length;
    const cost = (a: number, b: number) => {
      const seg = y.slice(a, b);
      const m = mean(seg);
      return seg.reduce((s, v) => s + (v - m) ** 2, 0);
    };
    const best = new Array<number>(n + 1).fill(Infinity);
    const from = new Array<number>(n + 1).fill(0);
    best[0] = -penalty;
    for (let t = minSegment; t <= n; t++) {
      for (let s = 0; s <= t - minSegment; s++) {
        if (best[s] === Infinity) continue;
        const c = best[s] + cost(s, t) + penalty;
        if (c < best[t]) {
          best[t] = c;
          from[t] = s;
        }
      }
    }
    const splits: number[] = [];
    for (let t = n; t > 0; t = from[t]) {
      if (from[t] > 0) splits.push(from[t]);
      else break;
    }
    return splits.sort((a, b) => a - b);
  }

  it("finds the same splits on many random series, with and without real steps", () => {
    for (let seed = 0; seed < 60; seed++) {
      const r = seeded(30000 + seed);
      const n = 40 + r.int(0, 40);
      const steps = r.int(0, 3);
      const at = range(steps).map(() => r.int(8, n - 8)).sort((a, b) => a - b);
      const y = range(n).map((i) => at.filter((k) => i >= k).length * 6 + r.normal());
      const penalty = 2 * Math.log(n) * 2;
      expect(pelt(y, penalty, 6)).toEqual(exhaustive(y, penalty, 6));
    }
  });
});
