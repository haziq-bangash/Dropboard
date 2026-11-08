import { describe, expect, it } from "vitest";
import { gatherInsightInput } from "../src/summarize";
import type { TableProfile } from "../src/profile";

describe("gatherInsightInput", () => {
  const profile: TableProfile = {
    rowCount: 500,
    columns: [
      { name: "day", type: "date", nullCount: 0, distinct: 300 },
      { name: "sales", type: "number", nullCount: 0, distinct: 400 },
      { name: "lat", type: "number", nullCount: 0, distinct: 450 },
      { name: "lng", type: "number", nullCount: 0, distinct: 450 },
      { name: "shop", type: "string", nullCount: 0, distinct: 6 },
    ],
    coordinates: { lat: "lat", lon: "lng" },
  };

  it("never totals, averages or compares a latitude or longitude", async () => {
    const queries: string[] = [];
    await gatherInsightInput(profile, async (sql) => {
      queries.push(sql);
      return [];
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.includes('"sales"'))).toBe(true);
    expect(queries.filter((q) => q.includes('"lat"') || q.includes('"lng"'))).toEqual([]);
  });

  it("counts exact copies, and skips the check for tiny or huge tables", async () => {
    const run = async (rows: number) => {
      const queries: string[] = [];
      const input = await gatherInsightInput({ ...profile, rowCount: rows }, async (sql) => {
        queries.push(sql);
        return sql.includes("copies") ? [{ copies: 7 }] : [];
      });
      return { input, asked: queries.some((q) => q.includes("copies")) };
    };
    expect((await run(500)).input.duplicates).toEqual({ rows: 7 });
    expect((await run(1)).asked).toBe(false);
    expect((await run(3_000_000)).asked).toBe(false);
  });
});
