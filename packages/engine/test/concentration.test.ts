import { describe, expect, it } from "vitest";
import { findInsights } from "../src/insights";
import { standoutAmong } from "../src/panelInsights";
import { range, seeded } from "./random";

const groups = (values: number[], column = "product") => ({ column, measure: "amount", values: values.map((value, i) => ({ label: `P${i + 1}`, value })) });

describe("one group far from the rest", () => {
  it("finds a product that sells several times what the others do, with how far out it is", () => {
    const r = seeded(1);
    const values = range(40).map(() => 1000 * (1 + r.normal() * 0.1));
    values[6] = 6200;
    const f = findInsights({ rowCount: 3000, groups: [groups(values)] }).find((x) => x.kind === "standout")!;
    expect(f.evidence.label).toBe("P7");
    expect(f.sentence).toMatch(/^P7 has the highest total amount among 40 values of product: 6200 against a typical \d+\.$/);
  });

  it("also finds one far below, and says lowest", () => {
    const r = seeded(2);
    const values = range(30).map(() => 1000 * (1 + r.normal() * 0.08));
    values[3] = 5;
    expect(findInsights({ rowCount: 900, groups: [groups(values)] }).find((x) => x.kind === "standout")!.sentence).toContain("has the lowest total amount");
  });

  it("almost never reports one when the groups are all the same kind of noise", () => {
    let tables = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = seeded(80_000 + seed);
      if (standoutAmong(range(40).map((i) => ({ label: `P${i}`, v: 1000 * (1 + r.normal() * 0.15) })))) tables++;
    }
    expect(tables / 300).toBeLessThanOrEqual(0.03);
  });

  it("needs enough groups to compare", () => {
    expect(standoutAmong([1, 2, 3, 4, 50].map((v, i) => ({ label: `P${i}`, v })))).toBeNull();
  });
});

describe("a few values holding most of a total", () => {
  const pareto = (top20: number, groups = 600) => ({ column: "customer_id", measure: "amount", groups, top10: top20 * 0.8, top20, biggest: 0.05 });

  it("says how much the top fifth holds, once it is far more than an even spread", () => {
    const f = findInsights({ rowCount: 3000, pareto: [pareto(0.74)] }).find((x) => x.kind === "pareto")!;
    expect(f.sentence).toBe("The top 20% of customer_id (120 of 600) account for 74% of amount.");
    expect(f.evidence).toMatchObject({ share20: 0.74, groups: 600, topGroups: 120 });
  });

  it("says nothing for an ordinary spread, or for too few values to talk about a top fifth", () => {
    expect(findInsights({ rowCount: 3000, pareto: [pareto(0.45)] }).some((f) => f.kind === "pareto")).toBe(false);
    expect(findInsights({ rowCount: 100, pareto: [pareto(0.9, 12)] }).some((f) => f.kind === "pareto")).toBe(false);
  });
});
