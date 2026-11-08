import { q, type ColumnProfile, type TableProfile } from "./profile";

/**
 * Working out what each column is, so charts and findings can follow from meaning and not from guesses about types.
 * A number can be a year, an identifier, an amount that adds up over time (revenue), a level at a moment (market value,
 * headcount) or a rate (a margin, a ratio). Adding up a year, an identifier or a rate means nothing, and adding up a level
 * across time is misleading, so each kind is aggregated differently. Everything here reads the column's name and a few
 * statistics (range, whether all values are whole numbers, how many are distinct) and never a row.
 */

export type MeasureKind = "flow" | "level" | "rate";

export type Role = "time" | "id" | "category" | "flow" | "level" | "rate" | "flag" | "text" | "constant" | "latitude" | "longitude";

export interface Understood {
  name: string;
  role: Role;
  /** A short, plain reason, so a person can see why and correct it. */
  reason: string;
  /** For a time column: dates, or a year stored as a whole number. */
  time?: "date" | "year";
}

const words = (name: string) => name.toLowerCase().replace(/[_\-./()]+/g, " ").replace(/\s+/g, " ").trim();

/** Names that say a number is a ratio, rate, margin or per-unit figure: averaged, never added up. */
const STRONG_RATE = /(^|\s)(ratio|rate|pct|percent|percentage|margin|roe|roa|roi|roic|roce|yield|return on|per share|per capita|per unit|per|growth|inflation|probability|ctr|cpc|cpm|cac|ltv|nps|churn)(\s|$)|%/;
/** Names that say a number is a level at a moment, not something that accrues: it is averaged or read at the latest time. */
const LEVEL = /(^|\s)(market cap|capitalization|equity|balance|assets?|liabilit\w*|debt|employees?|headcount|staff|population|inventory|stock|capital|backlog|subscribers|members|followers|age|temperature|humidity|pressure|altitude|height|weight|level|rank|ranking|seed)(\s|$)/;
/** Averaged measures: scores and durations, where a total means little. */
const WEAK_RATE = /(^|\s)(score|rating|index|satisfaction|discount|average|avg|mean|median|price|duration|minutes|hours|days|seconds|latency|speed|distance|salary|wage|tenure)(\s|$)/;
/** Names that say a number is an amount or a count of things: always added up, whatever its range. */
const FLOW_NAME = /(^|\s)(quantity|qty|units|count|orders|items|clicks|impressions|visits|sessions|sales|revenue|income|profit|cost|costs|expense|expenses|spend|amount|total|payments?|sold|shipped|views|signups|downloads|transactions|calls|tickets)(\s|$)/;
const POSITION_NAME = /^(lat|latitude|lon|lng|long|longitude)$/;
const ID_NAME = /(^|\s)(id|key|uuid|guid|ref|reference|sku|code|no|num|number|serial|index no|invoice|order no|transaction id)$/;
const YEAR_NAME = /(^|\s)(year|yr|fy|fiscal year|season|vintage|period year)(\s|$)/;

/** A whole-number column that holds calendar years. A column called Year, or whole numbers 1950 to 2100 on a short list of values. */
export function isYearColumn(c: ColumnProfile, rows: number): boolean {
  if (c.type !== "number" || c.integer === false || c.min === undefined || c.max === undefined) return false;
  if (c.min < 1800 || c.max > 2200 || c.distinct < 2) return false;
  if (YEAR_NAME.test(words(c.name))) return true;
  return c.min >= 1950 && c.max <= 2100 && c.distinct <= 80 && rows / c.distinct >= 2;
}

/** Does this column look like an identifier: a name that says so, or a value for nearly every row. */
export function looksLikeId(c: ColumnProfile, rows: number): boolean {
  const n = words(c.name);
  if (c.type === "number" && c.integer !== false && rows > 20 && c.distinct >= rows * 0.98 && c.min !== undefined && c.max !== undefined && c.max - c.min + 1 <= c.distinct * 1.05) return true;
  if (ID_NAME.test(n) && (rows <= 20 || c.distinct >= Math.min(rows * 0.5, 50))) return true;
  return c.type !== "number" && rows > 20 && c.distinct >= rows * 0.9;
}

/** The kind of a number column from its name and range alone: what it would be if it is a measure at all. */
export function valueKind(c: ColumnProfile): MeasureKind {
  const n = words(c.name);
  if (STRONG_RATE.test(n)) return "rate";
  if (FLOW_NAME.test(n) && !LEVEL.test(n)) return "flow";
  if (LEVEL.test(n)) return "level";
  if (WEAK_RATE.test(n)) return "rate";
  // a small whole-number scale (1 to 5 stars, 0 to 10 likelihood) repeated over many rows is a rating: its average means something, its total does not
  if (c.integer === true && c.min !== undefined && c.max !== undefined && c.distinct <= 12 && c.max - c.min <= 10 && c.min >= 0) return "rate";
  // fractions between 0 and 1 that are not whole numbers are shares or probabilities
  if (c.min !== undefined && c.max !== undefined && c.min >= 0 && c.max <= 1 && c.integer === false && c.distinct > 2) return "rate";
  return "flow";
}

/** What kind of measure a number column is, or null when it is not a measure (a year, an identifier, a constant, a flag). */
export function measureKind(c: ColumnProfile, rows: number): MeasureKind | null {
  if (c.type !== "number" || c.distinct <= 1) return null;
  // a latitude or longitude is a position, whether or not the pair was found: adding positions up means nothing
  if (POSITION_NAME.test(words(c.name))) return null;
  if (isYearColumn(c, rows) || looksLikeId(c, rows)) return null;
  return valueKind(c);
}

/** How to aggregate a measure over rows: flows add up, levels and rates are averaged. */
export const aggregateFor = (kind: MeasureKind) => (kind === "flow" ? "sum" : "avg");

export function understandColumns(profile: TableProfile): Understood[] {
  const rows = profile.rowCount;
  return profile.columns.map((c): Understood => {
    const done = (role: Role, reason: string, time?: "date" | "year"): Understood => ({ name: c.name, role, reason, ...(time ? { time } : {}) });
    if (c.distinct <= 1) return done("constant", "has one value");
    if (profile.coordinates?.lat === c.name) return done("latitude", "a latitude paired with a longitude");
    if (profile.coordinates?.lon === c.name) return done("longitude", "a longitude paired with a latitude");
    // named like a position, with values that fit one, even when no pair was found
    if (c.type === "number" && c.min !== undefined && c.max !== undefined) {
      const w = words(c.name);
      if (/^(lat|latitude)$/.test(w) && c.min >= -90 && c.max <= 90) return done("latitude", "named like a latitude, with values in range");
      if (/^(lon|lng|long|longitude)$/.test(w) && c.min >= -180 && c.max <= 180) return done("longitude", "named like a longitude, with values in range");
    }
    if (c.type === "date") return done("time", "holds dates", "date");
    if (c.type === "boolean") return done("flag", "true or false");
    if (c.type === "number") {
      if (isYearColumn(c, rows)) return done("time", "whole numbers that are calendar years", "year");
      if (looksLikeId(c, rows)) return done("id", "a different whole number on nearly every row, or named like an identifier");
      const kind = measureKind(c, rows)!;
      return done(kind, kind === "flow" ? "an amount that adds up" : kind === "level" ? "a level at a moment, not an amount that accrues" : "a rate, ratio or average");
    }
    // long text, different on every row, is notes or comments, not an identifier
    if ((c.textLength ?? 0) > 40) return done("text", "long text");
    if (looksLikeId(c, rows)) return done("id", "a different value on nearly every row, or named like an identifier");
    if (c.distinct === 2) return done("flag", "two values");
    if (c.distinct > rows * 0.5 || (c.textLength ?? 0) > 40) return done("text", "mostly different on every row, or long text");
    return done("category", c.distinct <= 20 ? "a few distinct values" : "many repeated values");
  });
}

/** The column to draw things over: a date column, or failing that a year column. The one with the most distinct values wins. */
/** +1 for a name that says when things happened, -1 for one that says when something else followed (shipping, due, ending). */
const clockScore = (name: string) => {
  const n = words(name);
  if (/(^|\s)(ship|shipped|shipping|due|end|ended|expiry|expires|expire|delivery|delivered|closed|close|resolved|renewal|updated|modified|birth|dob|next)(\s|$)/.test(n)) return -1;
  if (/(^|\s)(order|ordered|created|signup|sale|sold|transaction|visit|date|day|time|timestamp|week|month|period|start|started|opened|booked)(\s|$)/.test(n)) return 1;
  return 0;
};

export function timeColumn(profile: TableProfile): { column: ColumnProfile; kind: "date" | "year" } | null {
  const rows = profile.rowCount;
  const dates = profile.columns.filter((c) => c.type === "date" && c.distinct > 1).sort((a, b) => clockScore(b.name) - clockScore(a.name) || b.distinct - a.distinct);
  if (dates[0]) return { column: dates[0], kind: "date" };
  const years = profile.columns.filter((c) => isYearColumn(c, rows)).sort((a, b) => b.distinct - a.distinct);
  return years[0] ? { column: years[0], kind: "year" } : null;
}

/** SQL that turns a time column into a date, so every chart over time can use the same date axis. A year becomes 1 January of it. */
export function timeExpression(column: ColumnProfile, kind: "date" | "year"): string {
  return kind === "year" ? `make_date(CAST(${q(column.name)} AS INTEGER), 1, 1)` : q(column.name);
}
