import { describe, expect, it } from "vitest";
import { chiSquareSurvival, incompleteBeta, logGamma, normalCdf, normalTwoSided, tTwoSided } from "../src/stats/special";

// Reference values from standard statistical tables.
describe("special functions", () => {
  it("log gamma matches known factorials", () => {
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 6); // 4!
    expect(Math.exp(logGamma(10))).toBeCloseTo(362880, 1); // 9!
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 8);
  });

  it("normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normalCdf(-1.96)).toBeCloseTo(0.0249979, 6);
    expect(normalTwoSided(1.96)).toBeCloseTo(0.05, 3);
    expect(normalTwoSided(2.5758)).toBeCloseTo(0.01, 4);
  });

  it("incomplete beta edge cases and symmetry", () => {
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
    expect(incompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    // I_x(a,b) = 1 - I_(1-x)(b,a)
    expect(incompleteBeta(0.3, 2, 5) + incompleteBeta(0.7, 5, 2)).toBeCloseTo(1, 10);
  });

  it("Student's t two-sided p-values", () => {
    expect(tTwoSided(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSided(2.0, 10)).toBeCloseTo(0.0734, 3);
    expect(tTwoSided(3.055, 28)).toBeCloseTo(0.0049, 3);
    expect(tTwoSided(0, 20)).toBeCloseTo(1, 10);
    expect(tTwoSided(1.96, 100000)).toBeCloseTo(0.05, 3); // approaches the normal
    expect(tTwoSided(Infinity, 5)).toBe(0);
  });

  it("chi-square upper tail", () => {
    expect(chiSquareSurvival(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(5.991, 2)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(9.488, 4)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(18.307, 10)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(0, 3)).toBe(1);
    expect(chiSquareSurvival(200, 3)).toBeLessThan(1e-30);
  });
});
