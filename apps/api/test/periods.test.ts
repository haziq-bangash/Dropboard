import { buildProfile, detectPeriodKind, guardSql, periodDateSql, suggestDashboard, tidyColumnNames, type RunSql } from "@dropboard/engine";
import { describe, expect, it } from "vitest";
import { createSql } from "../eval/duckdb";
import { DATASETS } from "./corpus/datasets";

describe("recognising months, quarters and weekdays written as text", () => {
  it("knows each kind from its values", () => {
    expect(detectPeriodKind(["2023-01", "2023-02", "2023-12"])).toBe("year-month");
    expect(detectPeriodKind(["2023/1", "2023/02"])).toBe("year-month");
    expect(detectPeriodKind(["Jan 2023", "February 2023", "Mar-23"])).toBe("month-year");
    expect(detectPeriodKind(["2023-Q1", "2023 Q2", "Q3 2023", "Q4 2023"])).toBe("quarter-year");
    expect(detectPeriodKind(["Q1", "Q2", "q3"])).toBe("quarter-name");
    expect(detectPeriodKind(["January", "feb", "March", "Sept."])).toBe("month-name");
    expect(detectPeriodKind(["Mon", "Tuesday", "wed", "Thurs"])).toBe("weekday-name");
  });
  it("leaves ordinary text alone, and tolerates a stray value", () => {
    expect(detectPeriodKind(["North", "South", "East"])).toBeNull();
    expect(detectPeriodKind(["Marcus", "Mayor", "Monica"])).toBeNull();
    expect(detectPeriodKind(["Mon", "Tue"])).toBe("weekday-name");
    expect(detectPeriodKind(["2023-01", "2023-02", "2023-03", "2023-04", "2023-05", "2023-06", "2023-07", "2023-08", "2023-09", "2023-10", "oops"])).toBe("year-month");
    expect(detectPeriodKind(["2023-01", "n/a", "x", "y"])).toBeNull();
    expect(detectPeriodKind([])).toBeNull();
  });
});

describe("turning them into dates, in the database", () => {
  it("reads every dated kind as the first day of the period", async () => {
    const sql = await createSql();
    const date = (kind: Parameters<typeof periodDateSql>[0], value: string) => {
      const expr = periodDateSql(kind, "'" + value + "'")!;
      return sql.run(`SELECT CAST(CAST(${expr} AS DATE) AS VARCHAR) AS d`).rows[0][0];
    };
    expect(date("year-month", "2023-04")).toBe("2023-04-01");
    expect(date("year-month", "2023/4")).toBe("2023-04-01");
    expect(date("month-year", "Apr 2023")).toBe("2023-04-01");
    expect(date("month-year", "September 2022")).toBe("2022-09-01");
    expect(date("month-year", "Apr-23")).toBe("2023-04-01");
    expect(date("quarter-year", "2023-Q3")).toBe("2023-07-01");
    expect(date("quarter-year", "Q2 2021")).toBe("2021-04-01");
    expect(date("quarter-year", "2024 q4")).toBe("2024-10-01");
  });
});

describe("a text period becomes the time axis, and a month name follows the calendar", () => {
  const analyse = async (id: string) => {
    const dataset = DATASETS.find((d) => d.id === id)!;
    const sql = await createSql();
    sql.load(dataset.csv);
    const run: RunSql = async (q) => {
      if (/^\s*ALTER\b/i.test(q)) {
        sql.exec(q);
        return [];
      }
      const r = sql.run(q);
      return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
    };
    await tidyColumnNames(run);
    const profile = await buildProfile(run);
    const spec = suggestDashboard("t", profile);
    return { profile, spec, run };
  };

  it("draws revenue over time from months written as text, in date order", { timeout: 60_000 }, async () => {
    for (const id of ["text-months-iso", "text-months-words", "text-quarters"]) {
      const { spec, run } = await analyse(id);
      // companies by period: a line for each, each in date order, from the 12 quarters or 36 months
      const line = spec.charts.find((c) => c.type === "line")!;
      expect(line, id).toBeDefined();
      const g = guardSql(line.query);
      expect(g.ok).toBe(true);
      const rows = await run(g.ok ? g.sql : "");
      const byLine = new Map<string, string[]>();
      for (const r of rows) byLine.set(String(r.g ?? ""), [...(byLine.get(String(r.g ?? "")) ?? []), String(r.x)]);
      expect(byLine.size, id).toBeGreaterThan(1);
      for (const xs of byLine.values()) {
        expect(xs.length, id).toBeGreaterThanOrEqual(12);
        expect(xs, id).toEqual([...xs].sort());
      }
    }
  });

  it("orders bars by month and by weekday, not by size", async () => {
    const { spec, run } = await analyse("cyclic-months");
    const bar = (title: string) => spec.charts.find((c) => c.type === "bar" && c.title === title)!;
    const months = await run(guardSql(bar("sales by month").query).ok ? (guardSql(bar("sales by month").query) as { ok: true; sql: string }).sql : "");
    expect(months.map((r) => r.x)).toEqual(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
    const days = spec.charts.find((c) => c.type === "bar" && c.title.endsWith("by weekday"));
    if (days) {
      const g = guardSql(days.query);
      const rows = await run(g.ok ? g.sql : "");
      expect(rows.map((r) => r.x)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    }
  });
});
