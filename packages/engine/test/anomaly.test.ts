import { describe, expect, it } from "vitest";
import { ecod } from "../src/anomaly/ecod";
import { seriesAnomalies } from "../src/anomaly/series";
import { median, scaledMad } from "../src/stats/tests";
import { range, seeded } from "./random";

/** Columns of independent standard normal noise. */
const noise = (seed: number, d: number, n: number) => {
  const r = seeded(seed);
  return range(d).map(() => range(n).map(() => r.normal()));
};

describe("unusual rows (ECOD with a significance test)", () => {
  it("almost never reports anything in plain noise: the chance that a table of nothing gets an alarm stays near the level asked for", () => {
    let tables = 0;
    const trials = 200;
    for (let seed = 0; seed < trials; seed++) if (ecod(noise(seed, 6, 1500)).unusual.length > 0) tables++;
    expect(tables / trials).toBeLessThanOrEqual(0.03);
  }, 60_000);

  it("finds planted anomalies, in one measure and across several, and little else", () => {
    const cols = noise(1, 5, 2000);
    const planted = new Set<number>();
    // ten rows far out on one measure
    for (let k = 0; k < 10; k++) {
      cols[k % 5][100 + k * 7] = 9 * (k % 2 ? 1 : -1);
      planted.add(100 + k * 7);
    }
    // five rows moderately out on three measures at once: ordinary on each, unusual together
    for (let k = 0; k < 5; k++) {
      for (const c of [0, 1, 2]) cols[c][1500 + k] = 3.6 + k * 0.07 + c * 0.03;
      planted.add(1500 + k);
    }
    const found = ecod(cols).unusual.map((u) => u.index);
    const hits = found.filter((i) => planted.has(i)).length;
    expect(hits / planted.size).toBeGreaterThanOrEqual(0.8);
    expect(hits / found.length).toBeGreaterThanOrEqual(0.8);
  });

  it("says why: the measure and the side, in the most unusual row first", () => {
    const cols = noise(2, 4, 1500);
    cols[2][700] = -12;
    const top = ecod(cols).unusual[0];
    expect(top.index).toBe(700);
    expect(top.reasons[0]).toMatchObject({ measure: 2, side: "low" });
    expect(top.reasons[0].z).toBeLessThan(-8);
    // a value standing alone far from everything else needs no test: its gap is the evidence
    expect(top.source).toBe("isolated");
  });

  it("is not fooled by repeats of the same anomaly: twenty copies of one wild row are all found", () => {
    const cols = noise(3, 4, 1500);
    for (let k = 0; k < 20; k++) for (let j = 0; j < 4; j++) cols[j][50 + k] = j === 1 ? 10 : cols[j][50 + k];
    const found = new Set(ecod(cols).unusual.map((u) => u.index));
    let hits = 0;
    for (let k = 0; k < 20; k++) if (found.has(50 + k)) hits++;
    expect(hits).toBeGreaterThanOrEqual(18);
  });

  it("counts measures that move together once, so two copies of the same thing do not double the evidence", () => {
    let tables = 0;
    for (let seed = 0; seed < 100; seed++) {
      const base = noise(900 + seed, 3, 1500);
      const r = seeded(5000 + seed);
      // a fourth and fifth measure that are nearly copies of the first
      const cols = [...base, base[0].map((v) => v + r.normal() * 0.05), base[0].map((v) => v + r.normal() * 0.05)];
      if (ecod(cols).unusual.length > 0) tables++;
    }
    expect(tables / 100).toBeLessThanOrEqual(0.04);
  }, 60_000);

  it("copes with measures that take few values, a few rows, and a measure that never changes", () => {
    const r = seeded(4);
    const cols = [range(500).map(() => r.int(1, 5)), range(500).map(() => r.normal()), range(500).map(() => 7)];
    expect(() => ecod(cols)).not.toThrow();
    expect(ecod([range(10).map((i) => i)]).unusual).toEqual([]);
    expect(ecod([]).unusual).toEqual([]);
  });

  it("does not call a skewed, heavy-tailed measure unusual just for having a tail: only rows far beyond it", () => {
    // revenue-like: lognormal. Its long tail is how it is, not an error.
    const r = seeded(6);
    const cols = [range(3000).map(() => Math.exp(r.normal() * 0.8)), range(3000).map(() => r.normal())];
    const found = ecod(cols).unusual;
    // a table of lognormal values has natural extremes; they may be reported, but not more than a few
    expect(found.length).toBeLessThanOrEqual(30);
  });
});

/** Seasonal series with a trend and noise: a monthly figure over six years. */
function seasonal(seed: number, n = 72, noiseLevel = 0.04) {
  const r = seeded(seed);
  const phases = range(n).map((i) => i % 12);
  const y = range(n).map((i) => 1000 * (1 + i * 0.008) * (1 + 0.3 * Math.sin((phases[i] / 12) * Math.PI * 2)) * (1 + r.normal() * noiseLevel));
  return { y, phases };
}

describe("unusual points in a series", () => {
  it("finds a spike and a dip that break the pattern, and the points are the right ones", () => {
    const { y, phases } = seasonal(1);
    y[30] *= 1.7;
    y[55] *= 0.45;
    const found = seriesAnomalies(y, { season: { phases, period: 12 } });
    expect(found.map((f) => f.index).sort((a, b) => a - b)).toEqual([30, 55]);
    expect(found.find((f) => f.index === 30)!.relative!).toBeGreaterThan(0.5);
    expect(found.find((f) => f.index === 55)!.relative!).toBeLessThan(-0.4);
  });

  it("does not call the yearly peak an anomaly when it is the pattern, which a plain robust z-score does", () => {
    // flat all year, and three times as much every December
    const r = seeded(2);
    const phases = range(72).map((i) => i % 12);
    const y = range(72).map((i) => 1000 * (phases[i] === 11 ? 3 : 1) * (1 + r.normal() * 0.02));
    // the baseline: robust z of the values themselves, with no idea of season or trend
    const centre = median(y);
    const spread = scaledMad(y);
    const baselineFalseAlarms = y.filter((v) => Math.abs((v - centre) / spread) >= 3).length;
    const ours = seriesAnomalies(y, { season: { phases, period: 12 } }).length;
    expect(baselineFalseAlarms).toBeGreaterThanOrEqual(6);
    expect(ours).toBe(0);
  });

  it("does not flag a change of level or a steady climb: the trend follows them", () => {
    const r = seeded(3);
    const step = range(60).map((i) => (i < 30 ? 100 : 180) * (1 + r.normal() * 0.03));
    const climb = range(60).map((i) => 100 + i * 4 + r.normal() * 3);
    expect(seriesAnomalies(step).length).toBeLessThanOrEqual(1);
    expect(seriesAnomalies(climb).length).toBe(0);
  });

  it("almost never reports anything in plain noise", () => {
    let flagged = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = seeded(30_000 + seed);
      if (seriesAnomalies(range(60).map(() => 100 + r.normal() * 10)).length > 0) flagged++;
    }
    expect(flagged / 300).toBeLessThanOrEqual(0.03);
  }, 60_000);

  it("holds up when many points are anomalies: ten percent of the points spiked", () => {
    const { y, phases } = seasonal(4);
    // spread unevenly, so they are surprises and not a rhythm
    const bad = new Set([6, 17, 25, 30, 44, 53, 67]);
    for (const i of bad) y[i] *= 1.9;
    const found = new Set(seriesAnomalies(y, { season: { phases, period: 12 } }).map((f) => f.index));
    const hits = [...bad].filter((i) => found.has(i)).length;
    expect(hits).toBeGreaterThanOrEqual(6);
    expect([...found].filter((i) => !bad.has(i)).length).toBeLessThanOrEqual(1);
  });

  it("does not call a rhythm an anomaly: a spike in the first week of every month, in weekly data", () => {
    const r = seeded(11);
    const weeks = range(104);
    // rent on the first of the month: every fourth or fifth week carries about eight times the usual
    const y = weeks.map((i) => (Math.floor((i * 7) / 30.4) !== Math.floor(((i - 1) * 7) / 30.4) ? 1600 : 200) * (1 + r.normal() * 0.04));
    expect(seriesAnomalies(y)).toEqual([]);
  });

  it("still reports a few irregular spikes next to such a rhythm only if they are not part of it", () => {
    const { y, phases } = seasonal(7);
    y[10] *= 2.2;
    y[45] *= 0.3;
    const found = seriesAnomalies(y, { season: { phases, period: 12 } }).map((f) => f.index).sort((a, b) => a - b);
    expect(found).toEqual([10, 45]);
  });

  it("ignores series that are too short or perfectly flat, and a tiny wobble that is not meaningful", () => {
    expect(seriesAnomalies([1, 2, 3])).toEqual([]);
    expect(seriesAnomalies(range(40).map(() => 5))).toEqual([]);
    const r = seeded(8);
    const y = range(60).map(() => 1000 + r.normal() * 0.5);
    y[30] += 4; // many robust spreads away, but 0.4% of the level: not worth a person's time
    expect(seriesAnomalies(y)).toEqual([]);
  });
});
