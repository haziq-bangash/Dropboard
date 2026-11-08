import { describe, expect, it } from "vitest";
import { bindQuery } from "../src/bind";
import { guardSql } from "../src/sqlGuard";

const num = (name: string) => ({ name, type: "number" as const });
const str = (name: string) => ({ name, type: "string" as const });

describe("bindQuery", () => {
  it("leaves a query alone when it already has the columns the renderer reads", () => {
    expect(bindQuery("kpi", "SELECT sum(a) AS value FROM data", [num("value")])).toBe("SELECT sum(a) AS value FROM data");
    expect(bindQuery("bar", "SELECT r AS x, sum(a) AS y FROM data GROUP BY 1", [str("x"), num("y")])).toBe("SELECT r AS x, sum(a) AS y FROM data GROUP BY 1");
    // names are matched without regard to case
    expect(bindQuery("kpi", "SELECT 1 AS Value", [num("Value")])).toBe("SELECT 1 AS Value");
    expect(bindQuery("line", "SELECT 1 AS X, 2 AS Y", [num("X"), num("Y")])).toBe("SELECT 1 AS X, 2 AS Y");
  });

  it("renames a headline number to `value`", () => {
    const fixed = bindQuery("kpi", "SELECT sum(revenue) AS total_revenue FROM data", [num("total_revenue")])!;
    expect(fixed).toBe('SELECT "total_revenue" AS value FROM (SELECT sum(revenue) AS total_revenue FROM data) LIMIT 1');
    expect(guardSql(fixed).ok).toBe(true);
  });

  it("picks the first numeric column for a headline number when there are several", () => {
    const fixed = bindQuery("kpi", "SELECT region, sum(r) AS total FROM data GROUP BY 1", [str("region"), num("total")])!;
    expect(fixed).toContain('"total" AS value');
  });

  it("uses the first column as x and the first other numeric column as y", () => {
    const fixed = bindQuery("bar", "SELECT region, count(*) AS orders, sum(r) AS revenue FROM data GROUP BY 1", [str("region"), num("orders"), num("revenue")])!;
    expect(fixed).toContain('"region" AS x, "orders" AS y');
    expect(guardSql(fixed).ok).toBe(true);
  });

  it("skips a non-numeric second column when it looks for y", () => {
    const fixed = bindQuery("line", "SELECT month, label, total FROM t", [str("month"), str("label"), num("total")])!;
    expect(fixed).toContain('"month" AS x, "total" AS y');
  });

  it("only renames what is missing: a query with x but no y is still rewritten as a pair", () => {
    const fixed = bindQuery("scatter", "SELECT a AS x, b FROM data", [num("x"), num("b")])!;
    expect(fixed).toContain('"x" AS x, "b" AS y');
  });

  it("gives up when there is nothing numeric to plot", () => {
    expect(bindQuery("kpi", "SELECT region FROM data", [str("region")])).toBeNull();
    expect(bindQuery("bar", "SELECT region, city FROM data", [str("region"), str("city")])).toBeNull();
    expect(bindQuery("pie", "SELECT total FROM data", [num("total")])).toBeNull(); // one column cannot be both
    expect(bindQuery("bar", "SELECT 1 WHERE false", [])).toBeNull();
  });

  it("leaves a table chart alone", () => {
    expect(bindQuery("table", "SELECT * FROM data LIMIT 100", [str("a")])).toBe("SELECT * FROM data LIMIT 100");
  });

  it("quotes awkward column names safely", () => {
    const fixed = bindQuery("bar", 'SELECT 1 AS "my ""col""", 2 AS "other col"', [num('my "col"'), num("other col")])!;
    expect(fixed).toContain('"my ""col""" AS x, "other col" AS y');
  });

  it("copes with a trailing semicolon in the original query", () => {
    const fixed = bindQuery("kpi", "SELECT 1 AS total;", [num("total")])!;
    expect(fixed).toBe('SELECT "total" AS value FROM (SELECT 1 AS total) LIMIT 1');
  });
});
