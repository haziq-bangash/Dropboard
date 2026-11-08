import { describe, expect, it } from "vitest";
import { findInsights } from "../src/insights";
import { qualityFindings, type QualityInput } from "../src/quality";

const empty: QualityInput = { caseVariants: [], placeholders: [], numbersAsText: [], dates: [] };

describe("data quality findings", () => {
  it("says nothing when the checks found nothing", () => {
    expect(qualityFindings(undefined, 1000)).toEqual([]);
    expect(qualityFindings(empty, 1000)).toEqual([]);
    expect(findInsights({ rowCount: 1000, quality: empty }).some((f) => f.kind === "quality")).toBe(false);
  });

  it("puts every problem in one card, worst first, in words a person can act on", () => {
    const [f] = qualityFindings(
      {
        caseVariants: [{ column: "status", a: "Shipped", b: "SHIPPED", na: 3268, nb: 443 }],
        placeholders: [{ column: "revenue", value: "N/A", count: 361, of: 6216 }],
        numbersAsText: [{ column: "revenue", share: 0.94 }],
        dates: [{ column: "ship_date", future: 112, futureMax: "2099-01-01", ancient: 62, ancientMin: "1899-12-31", of: 6216 }],
        gaps: { column: "order_date", missing: 59, expected: 1095, unit: "day", first: "1 Jan 2021", last: "31 Dec 2023" },
        repeatedKeys: { entity: "Company", time: "Year", extra: 6 },
      },
      6216,
    );
    expect(f.kind).toBe("quality");
    expect(f.sentence).toMatch(/^7 things in the data change what its totals and charts mean: \w+, \w+, [\w ]+ and \d+ more\.$/);
    expect(f.sentence).toContain("status");
    expect(f.evidence.issues).toBe(7);
    const rows = f.details!.rows.map((r) => `${r[0]}: ${r[1]}`);
    expect(rows).toContain(`status: "Shipped" (3268 rows) and "SHIPPED" (443 rows) are the same value written two ways, so they are counted apart in every chart and total.`);
    expect(rows.some((r) => r.startsWith("revenue: 361 rows (5.8%) hold \"N/A\""))).toBe(true);
    expect(rows.some((r) => r.includes("Stored as text, but 94% of its values are numbers"))).toBe(true);
    expect(rows.some((r) => r.includes("112 dates are in the future (as late as 2099-01-01)"))).toBe(true);
    expect(rows.some((r) => r.includes("6 rows repeat a Company and Year"))).toBe(true);
    // most important first: a spelling that splits 60% of the rows outranks a handful of placeholders
    expect(rows[0].startsWith("status:")).toBe(true);
    expect(rows.findIndex((r) => r.includes("hold \"N/A\""))).toBeGreaterThan(rows.findIndex((r) => r.startsWith("status:")));
  });

  it("uses the singular for one problem, and keeps the values out of the evidence that goes to a model", () => {
    const [f] = qualityFindings({ ...empty, caseVariants: [{ column: "region", a: "North", b: "north", na: 10, nb: 5 }] }, 100);
    expect(f.sentence).toBe("1 thing in the data changes what its totals and charts mean: region.");
    expect(JSON.stringify(f.evidence)).not.toContain("North");
  });
});
