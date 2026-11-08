import type { ChartSpec } from "@dropboard/spec";
import { q } from "./profile";

/**
 * The common chart shapes as templates: a headline number, bars or a pie by a category, a line or an area over time. Pilot names the
 * columns and an aggregation and this builds the query, so for the shapes people ask for most there is no SQL for a model to get wrong,
 * and no column name that has not been checked against the table. Anything a template cannot say (a filter, a ratio of two columns, a
 * window) is still written as SQL and goes through the guard.
 */

export const AGGREGATES = ["sum", "avg", "count", "min", "max", "median", "distinct"] as const;
export type Aggregate = (typeof AGGREGATES)[number];
export const GRAINS = ["day", "week", "month", "quarter", "year"] as const;
export type Grain = (typeof GRAINS)[number];

export const TEMPLATE_TYPES = ["kpi", "bar", "pie", "line", "area"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export interface TemplateColumn {
  name: string;
  type: "number" | "string" | "date" | "boolean";
}

type Built = Omit<ChartSpec, "id" | "layout">;

const sql = (agg: Aggregate, column: string) => {
  const c = q(column);
  return agg === "distinct" ? `count(DISTINCT ${c})` : agg === "count" ? `count(${c})` : `${agg}(${c})`;
};

const word = (agg: Aggregate) => ({ sum: "Total", avg: "Average", count: "Count of", min: "Lowest", max: "Highest", median: "Typical", distinct: "Different values of" })[agg];
const MAX_BARS = 20;
const MAX_SLICES = 8;

/**
 * Build a chart from a template. `names` is what the model listed: for a number, the column to measure; for bars, a pie, a line or an
 * area, the column to group or date by first, then optionally a measure column, an aggregation (sum, avg, count, min, max, median,
 * distinct) and, for time, a step (day, week, month, quarter, year). Returns the chart, or the reason it cannot be made.
 */
export function templateChart(type: TemplateType, names: string[], columns: TemplateColumn[], title: string): Built | string {
  const find = (n: string) => columns.find((c) => c.name === n);
  const isAggregate = (n: string) => !find(n) && (AGGREGATES as readonly string[]).includes(n.toLowerCase());
  const isGrain = (n: string) => !find(n) && (GRAINS as readonly string[]).includes(n.toLowerCase());
  const aggregates = names.filter(isAggregate).map((n) => n.toLowerCase() as Aggregate);
  const grains = names.filter(isGrain).map((n) => n.toLowerCase() as Grain);
  const named = names.filter((n) => find(n));
  const unknown = names.find((n) => !find(n) && !isAggregate(n) && !isGrain(n));
  if (unknown !== undefined) return `no column called ${unknown}`;
  if (aggregates.length > 1) return "more than one aggregation was given";
  if (grains.length > 1) return "more than one time step was given";
  if (grains.length && type !== "line" && type !== "area") return `${type} has no time step`;
  const agg = aggregates[0];
  const isNumber = (n: string) => find(n)?.type === "number";

  if (type === "kpi") {
    if (named.length !== 1) return "a headline number needs one column";
    const m = named[0];
    const a = agg ?? (isNumber(m) ? "sum" : "distinct");
    if ((a === "sum" || a === "avg" || a === "median") && !isNumber(m)) return `${m} is not a number column, so it cannot be ${a === "sum" ? "added up" : "averaged"}`;
    return { type: "kpi", title: title || `${word(a)} ${m}`, query: `SELECT ${sql(a, m)} AS value FROM data` };
  }

  if (type === "bar" || type === "pie") {
    if (named.length < 1 || named.length > 2) return `${type === "bar" ? "bars" : "a pie"} need a column to group by, and optionally one to measure`;
    const [by, measure] = named;
    if (find(by)?.type === "number" || find(by)?.type === "date") return `${by} is not a column to group by (it is ${find(by)!.type === "date" ? "a date" : "a number"}): use a line for dates`;
    if (measure !== undefined && !isNumber(measure) && agg !== "count" && agg !== "distinct") return `${measure} is not a number column`;
    if (measure === undefined && agg !== undefined && agg !== "count") return `${agg} needs a column to measure`;
    const value = measure !== undefined ? sql(agg ?? "sum", measure) : "count(*)";
    const label = measure !== undefined ? `${word(agg ?? "sum")} ${measure} by ${by}` : `Rows by ${by}`;
    return {
      type,
      title: title || label,
      query: `SELECT ${q(by)} AS x, ${value} AS y FROM data WHERE ${q(by)} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ${type === "pie" ? MAX_SLICES : MAX_BARS}`,
      x: "x",
      y: ["y"],
    };
  }

  // line and area
  if (named.length < 1 || named.length > 2) return "a line needs a date column, and optionally one to measure";
  const [when, measure] = named;
  if (find(when)?.type !== "date") return `${when} is not a date column`;
  if (measure !== undefined && !isNumber(measure) && agg !== "count" && agg !== "distinct") return `${measure} is not a number column`;
  if (measure === undefined && agg !== undefined && agg !== "count") return `${agg} needs a column to measure`;
  const grain = grains[0] ?? "month";
  const value = measure !== undefined ? sql(agg ?? "sum", measure) : "count(*)";
  const label = measure !== undefined ? `${word(agg ?? "sum")} ${measure} by ${grain}` : `Rows by ${grain}`;
  return {
    type,
    title: title || label,
    query: `SELECT date_trunc('${grain}', ${q(when)}) AS x, ${value} AS y FROM data WHERE ${q(when)} IS NOT NULL GROUP BY 1 ORDER BY 1`,
    x: "x",
    y: ["y"],
  };
}
