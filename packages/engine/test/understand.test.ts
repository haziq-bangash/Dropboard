import { describe, expect, it } from "vitest";
import type { ColumnProfile } from "../src/profile";
import { tidyColumnNames } from "../src/profileSql";
import { isYearColumn, looksLikeId, measureKind, timeColumn, timeExpression, understandColumns, valueKind } from "../src/understand";

const num = (name: string, extra: Partial<ColumnProfile> = {}): ColumnProfile => ({ name, type: "number", nullCount: 0, distinct: 300, min: 0, max: 5000, integer: false, ...extra });

describe("year columns", () => {
  it("knows a column called Year, and whole numbers that are plainly years", () => {
    expect(isYearColumn(num("Year", { min: 2009, max: 2023, distinct: 15, integer: true }), 161)).toBe(true);
    expect(isYearColumn(num("fiscal_year", { min: 2015, max: 2024, distinct: 10, integer: true }), 100)).toBe(true);
    // no telling name: only a short list of whole numbers in a believable range, repeated over many rows
    expect(isYearColumn(num("x", { min: 2019, max: 2023, distinct: 5, integer: true }), 400)).toBe(true);
    expect(isYearColumn(num("price", { min: 1999, max: 2999, distinct: 800, integer: true }), 900)).toBe(false);
    expect(isYearColumn(num("Year", { min: 2009.5, max: 2023, distinct: 15, integer: false }), 161)).toBe(false);
  });
  it("becomes a date axis: 1 January of the year", () => {
    expect(timeExpression(num("Year"), "year")).toBe('make_date(CAST("Year" AS INTEGER), 1, 1)');
  });
  it("is the time axis when there is no date column, and a date column wins when there is one", () => {
    const year = num("Year", { min: 2009, max: 2023, distinct: 15, integer: true });
    expect(timeColumn({ rowCount: 100, columns: [year, num("Revenue")] })?.kind).toBe("year");
    const when: ColumnProfile = { name: "when", type: "date", nullCount: 0, distinct: 60 };
    expect(timeColumn({ rowCount: 100, columns: [year, when] })?.column.name).toBe("when");
  });
});

describe("what kind of measure a number is", () => {
  const kind = (name: string, extra?: Partial<ColumnProfile>) => measureKind(num(name, extra), 1000);
  it("adds up amounts and counts", () => {
    for (const n of ["Revenue", "Net Income", "EBITDA", "Cash Flow from Operating", "quantity", "orders", "spend", "clicks", "total_cost"]) expect(kind(n), n).toBe("flow");
  });
  it("averages ratios, rates and margins, whatever their wording", () => {
    for (const n of ["ROE", "Debt/Equity Ratio", "Net Profit Margin", "Inflation Rate(in US)", "discount_pct", "Earning Per Share", "Free Cash Flow per Share", "Return on Tangible Equity", "bounce_rate", "ctr"]) expect(kind(n), n).toBe("rate");
  });
  it("reads levels at a moment, not totals", () => {
    for (const n of ["Market Cap(in B USD)", "Share Holder Equity", "Number of Employees", "temperature_c", "age", "headcount"]) expect(kind(n), n).toBe("level");
  });
  it("averages scores, durations and prices", () => {
    for (const n of ["satisfaction", "resolution_hours", "unit_price", "salary", "performance_score"]) expect(kind(n), n).toBe("rate");
  });
  it("treats a small whole-number scale as a rating, but a named count as a count", () => {
    expect(kind("q1_ease", { integer: true, min: 1, max: 5, distinct: 5 })).toBe("rate");
    expect(kind("likelihood", { integer: true, min: 0, max: 10, distinct: 12 })).toBe("rate");
    expect(kind("quantity", { integer: true, min: 1, max: 8, distinct: 8 })).toBe("flow");
  });
  it("treats fractions between 0 and 1 as shares", () => {
    expect(kind("conversion", { min: 0, max: 0.9, integer: false })).toBe("rate");
  });
  it("is not a measure at all for a year, an identifier, a constant or a position", () => {
    expect(kind("Year", { integer: true, min: 2009, max: 2023, distinct: 15 })).toBeNull();
    expect(kind("order_id", { integer: true, min: 1000, max: 3399, distinct: 2400 })).toBeNull();
    expect(kind("flat", { distinct: 1 })).toBeNull();
    expect(kind("latitude", { min: -80, max: 80 })).toBeNull();
    expect(valueKind(num("anything"))).toBe("flow");
  });
});

describe("identifiers", () => {
  it("is a different whole number running from the first to the last, or a column named like one", () => {
    expect(looksLikeId(num("n", { integer: true, min: 1, max: 500, distinct: 500 }), 500)).toBe(true);
    expect(looksLikeId({ name: "customer_id", type: "string", nullCount: 0, distinct: 700 }, 2400)).toBe(true);
    expect(looksLikeId({ name: "region", type: "string", nullCount: 0, distinct: 4 }, 2400)).toBe(false);
    expect(looksLikeId({ name: "name", type: "string", nullCount: 0, distinct: 80 }, 80)).toBe(true);
  });
});

describe("understandColumns", () => {
  it("gives every column a role and a plain reason", () => {
    const roles = understandColumns({
      rowCount: 500,
      columns: [
        { name: "day", type: "date", nullCount: 0, distinct: 300 },
        { name: "region", type: "string", nullCount: 0, distinct: 5 },
        { name: "active", type: "boolean", nullCount: 0, distinct: 2 },
        { name: "notes", type: "string", nullCount: 0, distinct: 490, textLength: 120 },
        num("revenue"),
        { ...num("const"), distinct: 1 },
      ],
    });
    expect(roles.map((r) => r.role)).toEqual(["time", "category", "flag", "text", "flow", "constant"]);
    for (const r of roles) expect(r.reason.length).toBeGreaterThan(5);
  });
});

describe("tidyColumnNames", () => {
  it("trims the names a file arrived with, and leaves ones that would collide", async () => {
    const asked: string[] = [];
    await tidyColumnNames(async (sql) => {
      asked.push(sql);
      return sql.includes("DESCRIBE") ? [{ column_name: "Company " }, { column_name: " Year" }, { column_name: "a  b" }, { column_name: "x" }, { column_name: "x " }] : [];
    });
    expect(asked.filter((s) => s.startsWith("ALTER"))).toEqual([
      'ALTER TABLE data RENAME COLUMN "Company " TO "Company"',
      'ALTER TABLE data RENAME COLUMN " Year" TO "Year"',
      'ALTER TABLE data RENAME COLUMN "a  b" TO "a b"',
    ]);
  });
});
