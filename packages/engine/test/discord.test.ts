import { describe, expect, it } from "vitest";
import { shapeDiscord } from "../src";
import { range, seeded } from "./random";

const SEEDS = range(100).map((i) => i + 1);

/** A yearly wave over `years` years of months, with noise, and an optional change to the cycle in one year. */
function seasonal(seed: number, years: number, change?: { year: number; shape: (phase: number, base: number) => number }) {
  const r = seeded(seed);
  return range(years * 12).map((i) => {
    const phase = i % 12;
    const base = 100 + 30 * Math.sin((2 * Math.PI * phase) / 12);
    const v = change && Math.floor(i / 12) === change.year ? change.shape(phase, base) : base;
    return v + r.normal() * 4;
  });
}

describe("a stretch whose shape matches no other", () => {
  it("is found when one year's cycle goes flat", () => {
    let found = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const y = seasonal(seed, 8, { year: 5, shape: () => 100 });
      const d = shapeDiscord(y, { length: 12 });
      if (d && d.index + 12 > 5 * 12 && d.index < 6 * 12 + 12) found++;
    }
    expect(found).toBeGreaterThanOrEqual(38);
  });

  it("is found when one year's cycle runs backwards", () => {
    let found = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const y = seasonal(seed, 8, { year: 3, shape: (_p, base) => 200 - base });
      const d = shapeDiscord(y, { length: 12 });
      if (d && d.index + 12 > 3 * 12 && d.index < 4 * 12 + 12) found++;
    }
    expect(found).toBeGreaterThanOrEqual(38);
  });

  it("is found in a series with no stated cycle, where a stretch loses its swings", () => {
    let found = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const r = seeded(seed);
      const y = range(240).map((i) => (i >= 120 && i < 140 ? 100 : 100 + 25 * Math.sin((2 * Math.PI * i) / 20)) + r.normal() * 3);
      const d = shapeDiscord(y);
      if (d && d.index + d.length > 120 && d.index < 140) found++;
    }
    expect(found).toBeGreaterThanOrEqual(38);
  });

  const nullCases: Record<string, (seed: number) => number[]> = {
    "noise": (s) => {
      const r = seeded(s);
      return range(200).map(() => 100 + r.normal() * 10);
    },
    "a random walk": (s) => {
      const r = seeded(s);
      let v = 100;
      return range(200).map(() => (v += r.normal() * 3));
    },
    "a steady climb with noise": (s) => {
      const r = seeded(s);
      return range(150).map((i) => 50 + i * 2 + r.normal() * 8);
    },
    "a yearly wave with noise": (s) => seasonal(s, 8),
    "a slow wave with noise": (s) => {
      const r = seeded(s);
      return range(200).map((i) => 100 + 20 * Math.sin(i / 11) + r.normal() * 5);
    },
    "a drifting level with a wave": (s) => {
      const r = seeded(s);
      let level = 100;
      return range(144).map((i) => (level += r.normal() * 1.5) + 20 * Math.sin((2 * Math.PI * (i % 12)) / 12) + r.normal() * 3);
    },
  };
  for (const [name, make] of Object.entries(nullCases)) {
    it(`finds nothing in ${name}`, () => {
      let false_ = 0;
      for (const seed of SEEDS) if (shapeDiscord(make(seed), name.includes("yearly") || name.includes("drifting") ? { length: 12 } : {})) false_++;
      // at most one series in a hundred
      expect(false_, `${name}: false alarms out of 100`).toBeLessThanOrEqual(1);
    });
  }

  it("needs enough points", () => {
    expect(shapeDiscord(range(30).map((i) => Math.sin(i)))).toBeNull();
  });
});
