import { describe, expect, it } from "vitest";
import { findInsights, type InsightInput } from "../src/insights";
import { range, seeded } from "./random";

type Panel = NonNullable<InsightInput["panel"]>[number];
const periods = (n: number) => range(n).map((i) => ({ x: Date.UTC(2010 + i, 0, 1), label: String(2010 + i) }));
const input = (...panels: Panel[]): InsightInput => ({ rowCount: 500, panel: panels });

/** Ten entities over twelve years: nine steady and noisy, and the ones a test plants a story in. */
function plantedPanel(seed: number): Panel {
  const r = seeded(seed);
  const n = 12;
  const steady = (level: number) => range(n).map(() => level * (1 + r.normal() * 0.04));
  return {
    entity: "Company",
    measure: "Revenue",
    kind: "flow",
    periods: periods(n),
    entities: [
      { label: "Giant", y: steady(1300) },
      // a steady rise to about five times the start
      { label: "Rocket", y: range(n).map((i) => 100 * (1 + i * 0.4) * (1 + r.normal() * 0.03)) },
      // a steady fall to about a third
      { label: "Stall", y: range(n).map((i) => 300 * (1 - i * 0.06) * (1 + r.normal() * 0.03)) },
      // flat, with one year that triples
      { label: "Spike", y: range(n).map((i) => 150 * (i === 8 ? 3.2 : 1) * (1 + r.normal() * 0.03)) },
      // from near the bottom to near the top
      { label: "Climber", y: range(n).map((i) => (60 + i * 45) * (1 + r.normal() * 0.02)) },
      ...range(5).map((k) => ({ label: `Steady ${k}`, y: steady(200 + k * 25) })),
    ],
  };
}

describe("findings for entities over periods", () => {
  const found = findInsights(input(plantedPanel(1)), { limit: 30 });
  const has = (kind: string, label: string) => found.some((f) => f.kind === kind && f.evidence.label === label);

  it("says who leads, with their share of the latest total", () => {
    const f = found.find((x) => x.kind === "leader")!;
    expect(f.evidence.label).toBe("Giant");
    expect(f.sentence).toMatch(/^Giant has the largest Revenue in 2021: \d+% of the total across 10 values of Company/);
  });

  it("finds the entity that rose and the one that fell, from their own figures", () => {
    expect(has("entitytrend", "Rocket")).toBe(true);
    expect(has("entitytrend", "Stall")).toBe(true);
    const rocket = found.find((x) => x.kind === "entitytrend" && x.evidence.label === "Rocket")!;
    expect(rocket.sentence).toMatch(/^Rocket's Revenue rose about \d+% between 2010 and 2021\.$/);
  });

  it("finds the one-period move that nothing else comes near", () => {
    const f = found.find((x) => x.kind === "jump")!;
    expect(f.evidence.label).toBe("Spike");
    // the year it tripled, or the year it fell back: the same one-off, and either is the biggest move
    expect(["2018", "2019"]).toContain(f.evidence.at);
  });

  it("finds who changed rank most, when their own figure really changed", () => {
    expect(has("rankshift", "Climber")).toBe(true);
    const f = found.find((x) => x.kind === "rankshift" && x.evidence.label === "Climber")!;
    expect(Number(f.evidence.places)).toBeGreaterThanOrEqual(3);
  });

  it("says each entity trend once and keeps only the strongest rise and fall for a measure", () => {
    const trends = found.filter((x) => x.kind === "entitytrend");
    expect(trends.length).toBeLessThanOrEqual(2);
  });

  it("finds an entity far from its peers in a level or a rate", () => {
    const r = seeded(5);
    const level: Panel = {
      entity: "Company",
      measure: "Margin",
      kind: "rate",
      periods: periods(8),
      entities: range(9).map((k) => ({ label: `C${k}`, y: range(8).map(() => (k === 4 ? 41 : 12) + r.normal()) })),
    };
    const f = findInsights(input(level)).find((x) => x.kind === "standout")!;
    expect(f.evidence.label).toBe("C4");
    expect(f.sentence).toMatch(/^C4 has the highest Margin in 2017/);
  });

  it("describes every finding in words with no broken numbers", () => {
    for (const f of found) {
      expect(f.sentence + f.headline + f.next).not.toMatch(/NaN|undefined|Infinity/);
      expect(f.figure.value).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});

describe("a panel with nothing in it", () => {
  it("almost never produces a finding: every entity is the same noise around the same level", () => {
    let with_ = 0;
    const trials = 300;
    for (let seed = 0; seed < trials; seed++) {
      const r = seeded(70_000 + seed);
      const panel: Panel = {
        entity: "Company",
        measure: "Revenue",
        kind: seed % 3 === 0 ? "level" : seed % 3 === 1 ? "flow" : "rate",
        periods: periods(10),
        entities: range(10).map((k) => ({ label: `E${k}`, y: range(10).map(() => 100 * (1 + r.normal() * 0.1)) })),
      };
      const kinds = findInsights(input(panel)).filter((f) => ["leader", "standout", "entitytrend", "jump", "rankshift"].includes(f.kind));
      if (kinds.length) with_++;
    }
    expect(with_ / trials).toBeLessThanOrEqual(0.05);
  }, 60_000);

  it("does not read a total that only changes because entities joined as growth: each is judged by its own figures", () => {
    // five entities from the start, five that begin halfway: every entity is flat, but the total doubles
    const r = seeded(9);
    const n = 12;
    const panel: Panel = {
      entity: "Company",
      measure: "Revenue",
      kind: "flow",
      periods: periods(n),
      entities: range(10).map((k) => ({ label: `E${k}`, y: range(n).map((i) => (k >= 5 && i < 6 ? null : 100 * (1 + r.normal() * 0.03))) })),
    };
    expect(findInsights(input(panel)).filter((f) => f.kind === "entitytrend")).toEqual([]);
  });
});
