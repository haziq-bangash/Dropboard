import { describe, expect, it } from "vitest";
import { computeRows, FULL, rowPath, SMALL } from "../src/lib/logo-geometry";

describe("logo geometry", () => {
  for (const [name, options] of [["full", FULL], ["small", SMALL]] as const) {
    describe(name, () => {
      const rows = computeRows(options);

      it("has the requested number of rows and exactly one accent", () => {
        expect(rows).toHaveLength(options.count);
        expect(rows.filter((r) => r.accent)).toHaveLength(1);
        expect(rows[options.accentIndex].accent).toBe(true);
      });

      it("spans exactly the height of the D, with equal gaps and no overlap", () => {
        expect(rows[0].y).toBeCloseTo(options.top);
        const last = rows[rows.length - 1];
        expect(last.y + last.h).toBeCloseTo(options.top + options.height);
        for (let i = 1; i < rows.length; i++) {
          const gap = rows[i].y - (rows[i - 1].y + rows[i - 1].h);
          expect(gap).toBeCloseTo(options.gap);
        }
      });

      it("shares one flat left edge, like the stem of a D", () => {
        expect(new Set(rows.map((r) => r.x)).size).toBe(1);
      });

      it("has a half-circle bowl whose radius is half the height", () => {
        for (const r of rows) {
          expect(r.radius).toBeCloseTo(options.height / 2);
          expect(r.cx).toBeCloseTo(options.left + options.straight);
        }
      });

      it("keeps the whole D inside the 100 x 100 tile with room around it", () => {
        const right = options.left + options.straight + options.height / 2;
        expect(options.left).toBeGreaterThanOrEqual(15);
        expect(right).toBeLessThanOrEqual(85);
        expect(options.top).toBeGreaterThanOrEqual(15);
        expect(options.top + options.height).toBeLessThanOrEqual(85);
      });

      it("draws each row as a closed slice with one arc", () => {
        for (const r of rows) {
          const d = rowPath(r, options);
          expect(d.startsWith("M")).toBe(true);
          expect(d.endsWith("Z")).toBe(true);
          expect(d.match(/A/g)).toHaveLength(1);
        }
      });
    });
  }

  it("makes the top and bottom edges of the D flat up to where the bowl starts", () => {
    const rows = computeRows(FULL);
    const top = rowPath(rows[0], FULL);
    // the first horizontal move (H) of the top row runs along the flat top edge, to the start of the bowl
    const reach = Number(top.match(/H(-?[\d.]+)A/)?.[1]);
    expect(reach).toBeCloseTo(FULL.left + FULL.straight, 0);
  });

  it("reaches farthest to the right at the middle of the D", () => {
    const rows = computeRows(FULL);
    const reaches = rows.map((r) => Number(rowPath(r, FULL).match(/H(-?[\d.]+)A/)?.[1]));
    const middle = Math.max(...reaches);
    expect(reaches[Math.floor(rows.length / 2)]).toBe(middle);
  });
});
