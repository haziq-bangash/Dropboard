import { describe, expect, it } from "vitest";
import { cellKind, normalizeCell } from "../src/lib/cells";

describe("cellKind", () => {
  it.each([
    ["Date32<DAY>", "date"],
    ["Date64<MILLISECOND>", "date"],
    ["Timestamp<MICROSECOND>", "timestamp"],
    ["Decimal[38e+0]", "decimal"],
    ["Int32", null],
    ["Utf8", null],
  ])("%s -> %s", (type, kind) => expect(cellKind(type)).toBe(kind));
});

describe("normalizeCell", () => {
  it("turns epoch milliseconds into ISO dates", () => {
    expect(normalizeCell("date", 1735776000000)).toBe("2025-01-02");
    expect(normalizeCell("date", 1735776000000n)).toBe("2025-01-02");
  });
  it("turns timestamps into full ISO strings", () => {
    expect(normalizeCell("timestamp", 1735776000000)).toBe("2025-01-02T00:00:00.000Z");
  });
  it("turns decimals, including string-like objects, into numbers", () => {
    expect(normalizeCell("decimal", "2495")).toBe(2495);
    expect(normalizeCell("decimal", { toString: () => "120825.5" })).toBe(120825.5);
  });
  it("converts bigint to number and passes other values through", () => {
    expect(normalizeCell(null, 5n)).toBe(5);
    expect(normalizeCell(null, "abc")).toBe("abc");
    expect(normalizeCell(null, 3.5)).toBe(3.5);
  });
  it("keeps nulls as null", () => {
    expect(normalizeCell("date", null)).toBeNull();
    expect(normalizeCell("decimal", undefined)).toBeNull();
  });
  it("leaves unparseable decimals untouched", () => {
    expect(normalizeCell("decimal", "n/a")).toBe("n/a");
  });
});
