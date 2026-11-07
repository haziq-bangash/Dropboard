import { describe, expect, it } from "vitest";
import { STARTERS } from "../src/starters";

const parse = (csv: string) => csv.trimEnd().split("\n").map((line) => line.split(","));

describe("starter datasets", () => {
  it("offers four distinct samples", () => {
    expect(STARTERS.map((s) => s.id)).toEqual(["ecommerce-orders", "household-spending", "marketing-performance", "support-tickets"]);
    expect(new Set(STARTERS.map((s) => s.fileName)).size).toBe(4);
  });

  for (const starter of STARTERS) {
    describe(starter.title, () => {
      const csv = starter.csv();
      const [header, ...rows] = parse(csv);

      it("is the same file every time", () => {
        expect(starter.csv()).toBe(csv);
      });

      it("has a sensible size, and reports it", () => {
        expect(rows.length).toBe(starter.rows);
        expect(rows.length).toBeGreaterThanOrEqual(200);
        expect(rows.length).toBeLessThanOrEqual(2000);
        expect(csv.length).toBeLessThan(150_000);
      });

      it("has a full, rectangular table with no empty cells", () => {
        expect(header.length).toBeGreaterThanOrEqual(5);
        for (const row of rows) {
          expect(row).toHaveLength(header.length);
          for (const cell of row) expect(cell.trim()).not.toBe("");
        }
      });

      it("has valid dates in 2025 in the first date column, and a numeric measure before any category", () => {
        const dateIdx = header.findIndex((h) => /date|week_start/.test(h));
        expect(dateIdx).toBe(0);
        for (const row of rows) {
          expect(row[dateIdx]).toMatch(/^2025-\d\d-\d\d$/);
          expect(Number.isNaN(Date.parse(row[dateIdx]))).toBe(false);
        }
        const firstNumeric = header.findIndex((_, i) => rows.every((r) => r[i] !== "" && !Number.isNaN(Number(r[i]))) && !/_id$/.test(header[i]));
        const firstCategory = header.findIndex((_, i) => rows.some((r) => Number.isNaN(Number(r[i]))) && i !== dateIdx);
        expect(firstNumeric).toBeGreaterThan(-1);
        expect(firstNumeric).toBeLessThan(firstCategory < 0 ? Infinity : firstCategory + 6);
      });

      it("keeps categories few enough to chart", () => {
        const categoryColumns = header.map((_, i) => i).filter((i) => i !== 0 && rows.some((r) => Number.isNaN(Number(r[i]))));
        expect(categoryColumns.length).toBeGreaterThanOrEqual(2);
        for (const i of categoryColumns) {
          const distinct = new Set(rows.map((r) => r[i])).size;
          expect(distinct).toBeGreaterThan(1);
          expect(distinct).toBeLessThanOrEqual(20);
        }
      });

      it("has positive measures", () => {
        const numeric = header.map((_, i) => i).filter((i) => !/_id$/.test(header[i]) && rows.every((r) => !Number.isNaN(Number(r[i]))) && i !== 0);
        for (const i of numeric) for (const row of rows) expect(Number(row[i])).toBeGreaterThanOrEqual(0);
      });
    });
  }
});
