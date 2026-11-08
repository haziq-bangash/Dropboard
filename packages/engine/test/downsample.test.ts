import { describe, expect, it } from "vitest";
import { minMaxDownsample } from "../src/downsample";
import { range, seeded } from "./random";

const pts = (ys: number[]) => ys.map((y, i) => ({ x: i, y }));

describe("minMaxDownsample", () => {
  it("leaves a short series alone", () => {
    const p = pts([1, 2, 3]);
    expect(minMaxDownsample(p, (q) => q.y, 100)).toBe(p);
  });

  it("keeps the first and last point, stays in order, and stays under the limit", () => {
    const r = seeded(1);
    const p = pts(range(100_000).map(() => r.normal()));
    const out = minMaxDownsample(p, (q) => q.y, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out[0]).toBe(p[0]);
    expect(out.at(-1)).toBe(p.at(-1));
    expect(out.every((q, i) => i === 0 || q.x > out[i - 1].x)).toBe(true);
  });

  it("never loses the highest or lowest point of the whole series", () => {
    const r = seeded(2);
    const ys = range(50_000).map(() => r.normal());
    ys[12_345] = 40; // a spike
    ys[33_333] = -35; // a dip
    const out = minMaxDownsample(pts(ys), (q) => q.y, 500);
    expect(Math.max(...out.map((q) => q.y))).toBe(40);
    expect(Math.min(...out.map((q) => q.y))).toBe(-35);
  });

  it("is the same however many times it is asked", () => {
    const r = seeded(3);
    const p = pts(range(5000).map(() => r.normal()));
    expect(minMaxDownsample(p, (q) => q.y, 300)).toEqual(minMaxDownsample(p, (q) => q.y, 300));
  });
});
