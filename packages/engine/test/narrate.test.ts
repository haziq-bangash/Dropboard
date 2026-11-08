import { describe, expect, it } from "vitest";
import type { Finding } from "../src/insights";
import { checkNarration, fillTokens, numbersTraceable, toNarrateFindings } from "../src/narrate";

const base = { p: null, strength: 1, headline: "h", figure: { value: "1", label: "l" }, next: "n" };
const dominance: Finding = { ...base, kind: "dominance", columns: ["region"], sentence: "North makes up 41% of region", evidence: { label: "North", share: 0.406, timesEven: 2.03 } };
const outlier: Finding = { ...base, kind: "outlier", columns: ["amount"], sentence: "x", evidence: { count: 2, share: 0.002, worstValue: 98765.4321, spreadsAway: 14.2 } };
const change: Finding = { ...base, kind: "change", columns: ["revenue"], sentence: "x", evidence: { before: 1200, after: 1800, shiftInNoiseUnits: 6.1, at: "March 2025" } };

describe("toNarrateFindings", () => {
  it("keeps numbers and holds back every value from the rows", () => {
    const sent = toNarrateFindings([dominance, outlier, change]);
    expect(sent[0]).toEqual({ id: "f0", kind: "dominance", columns: ["region"], facts: { share: 0.406, timesEven: 2.03 }, tokens: ["{label}"] });
    expect(sent[1].facts).not.toHaveProperty("worstValue");
    expect(sent[1].tokens).toEqual(["{worstValue}"]);
    expect(sent[2].tokens).toEqual(["{at}"]);
    const json = JSON.stringify(sent);
    for (const secret of ["North", "98765", "March 2025"]) expect(json).not.toContain(secret);
  });
});

describe("fillTokens", () => {
  it("puts the real text back, and refuses a placeholder it cannot fill", () => {
    expect(fillTokens("{label} leads", dominance.evidence)).toBe("North leads");
    expect(fillTokens("around {at}", change.evidence)).toBe("around March 2025");
    expect(fillTokens("{secret} leads", dominance.evidence)).toBeNull();
    expect(fillTokens("{at} here", dominance.evidence)).toBeNull();
  });
});

describe("numbersTraceable", () => {
  const facts = { share: 0.406, timesEven: 2.03, before: 12400, after: 18000 };
  it("accepts the finding's own numbers however they are written", () => {
    expect(numbersTraceable("It makes up 41% of rows, about 2 times an even split.", facts)).toBe(true);
    expect(numbersTraceable("Up from 12.4k to 18,000.", facts)).toBe(true);
    expect(numbersTraceable("{label} leads, one of three groups.", facts)).toBe(true);
  });
  it("rejects a number the model was not given", () => {
    expect(numbersTraceable("It makes up 73% of rows.", facts)).toBe(false);
    expect(numbersTraceable("Revenue reached 54,321.", facts)).toBe(false);
  });
});

describe("checkNarration", () => {
  const sent = toNarrateFindings([dominance, outlier]);
  const good = { id: "f0", headline: "{label} leads", sentence: "{label} makes up 41% of region.", next: "Check the reliance on one value." };

  it("keeps a valid item", () => {
    expect(checkNarration(sent, [good])).toEqual([good]);
  });
  it("drops an item with an unknown id, a placeholder it was not given, a stray brace or an untraceable number", () => {
    expect(checkNarration(sent, [{ ...good, id: "f9" }])).toEqual([]);
    expect(checkNarration(sent, [{ ...good, sentence: "{at} was big." }])).toEqual([]);
    expect(checkNarration(sent, [{ ...good, sentence: "Use {x." }])).toEqual([]);
    expect(checkNarration(sent, [{ ...good, sentence: "{label} makes up 88% of region." }])).toEqual([]);
  });
  it("keeps the first of a repeated id and trims whitespace", () => {
    const out = checkNarration(sent, [{ ...good, headline: "  {label}   leads " }, good]);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toBe("{label} leads");
  });
});

describe("applyNarration", () => {
  const items = [{ id: "f0", headline: "{label} leads", sentence: "{label} makes up 41% of region.", next: "Check reliance." }];
  it("puts real text back, leaves other findings and every figure alone", async () => {
    const { applyNarration } = await import("../src/narrate");
    const out = applyNarration([dominance, outlier], items);
    expect(out[0].headline).toBe("North leads");
    expect(out[0].sentence).toBe("North makes up 41% of region.");
    expect(out[0].figure).toEqual(dominance.figure);
    expect(out[1]).toBe(outlier);
  });
  it("keeps the plain wording when a placeholder cannot be filled", async () => {
    const { applyNarration } = await import("../src/narrate");
    const out = applyNarration([outlier], [{ id: "f0", headline: "{label}", sentence: "x", next: "y" }]);
    expect(out[0]).toBe(outlier);
  });
});
