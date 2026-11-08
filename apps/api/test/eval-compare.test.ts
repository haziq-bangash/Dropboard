import { describe, expect, it } from "vitest";
import { compare, compareAny, sameCell } from "../eval/compare";
import type { Result } from "../eval/duckdb";

const r = (columns: string[], rows: (string | null)[][]): Result => ({ columns, rows });

describe("sameCell", () => {
  it("treats close numbers as equal and far ones as different", () => {
    expect(sameCell("100", "100.0")).toBe(true);
    expect(sameCell("5228.219999999999", "5228.22")).toBe(true);
    expect(sameCell("1000", "1004")).toBe(true); // within half a percent
    expect(sameCell("1000", "1010")).toBe(false);
    expect(sameCell("0.004", "0")).toBe(true); // tiny absolute difference
    expect(sameCell("3", "4")).toBe(false);
  });

  it("ignores case and a midnight time on dates", () => {
    expect(sameCell("South", "south")).toBe(true);
    expect(sameCell("2025-01-01", "2025-01-01 00:00:00")).toBe(true);
    expect(sameCell("2025-01-01", "2025-01-01T00:00:00.000Z")).toBe(true);
    expect(sameCell("2025-01-01", "2025-01-02")).toBe(false);
    expect(sameCell("South", "North")).toBe(false);
  });

  it("handles nulls and non-numbers", () => {
    expect(sameCell(null, null)).toBe(true);
    expect(sameCell(null, "0")).toBe(false);
    expect(sameCell("", "0")).toBe(false);
    expect(sameCell("abc", "1")).toBe(false);
  });
});

describe("compare", () => {
  it("accepts the same single value", () => {
    expect(compare(r(["v"], [["120825"]]), r(["total_revenue"], [["120825.0"]])).ok).toBe(true);
  });

  it("is not thrown by extra columns, column order or row order", () => {
    const gold = r(["region", "total"], [["South", "100"], ["North", "50"]]);
    const got = r(["t", "extra", "r"], [["50", "x", "North"], ["100", "y", "South"]]);
    expect(compare(gold, got).ok).toBe(true);
  });

  it("rejects a different number of rows, or a wrong value", () => {
    expect(compare(r(["a"], [["1"], ["2"]]), r(["a"], [["1"]])).ok).toBe(false);
    expect(compare(r(["a"], [["1"]]), r(["a"], [["2"]])).ok).toBe(false);
    expect(compare(r(["a", "b"], [["South", "100"]]), r(["a"], [["South"]])).ok).toBe(false);
  });

  it("does not let one answer cell stand in for two gold cells", () => {
    expect(compare(r(["a", "b"], [["5", "5"]]), r(["x"], [["5"]])).ok).toBe(false);
    expect(compare(r(["a", "b"], [["5", "5"]]), r(["x", "y"], [["5", "5"]])).ok).toBe(true);
  });

  it("does not let one answer row stand in for two gold rows", () => {
    expect(compare(r(["a"], [["1"], ["1"]]), r(["a"], [["1"], ["2"]])).ok).toBe(false);
  });

  it("accepts a ratio as a fraction or as a percentage when both are allowed", () => {
    const gold = r(["share"], [["0.52"]]);
    expect(compare(gold, r(["p"], [["52"]]), [1, 100]).ok).toBe(true);
    expect(compare(gold, r(["p"], [["0.52"]]), [1, 100]).ok).toBe(true);
    expect(compare(gold, r(["p"], [["52"]])).ok).toBe(false);
  });

  it("explains a failure", () => {
    expect(compare(r(["a"], [["1"], ["2"]]), r(["a"], [["1"]])).reason).toBe("expected 2 row(s), got 1");
    expect(compare(r(["a"], [["1"]]), r(["a"], [["9"]])).reason).toContain("first row: 9");
  });
});

describe("compareAny", () => {
  it("is right if any acceptable answer matches", () => {
    const monthDate = r(["m"], [["2025-01-01"]]);
    const monthNumber = r(["m"], [["1"]]);
    expect(compareAny([monthDate, monthNumber], r(["m"], [["1"]])).ok).toBe(true);
    expect(compareAny([monthDate, monthNumber], r(["m"], [["2025-01-01 00:00:00"]])).ok).toBe(true);
    expect(compareAny([monthDate, monthNumber], r(["m"], [["Jan"]])).ok).toBe(false);
    expect(compareAny([], r(["m"], [["1"]])).ok).toBe(false);
  });
});
