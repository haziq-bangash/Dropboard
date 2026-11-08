import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import { q, type ColumnProfile, type TableProfile } from "./profile";

const MAX_CHARTS = 8;
const MAX_CATEGORIES = 20;

// Columns that look like identifiers make poor measures or categories.
const looksLikeId = (c: ColumnProfile, rows: number) =>
  /(^|_|\s)id$/i.test(c.name) || (c.type !== "number" && c.distinct >= rows * 0.9 && rows > 20);

// Names that say a column is a rate, price, duration or score. Adding those up means little, so they are averaged.
const AVERAGED = /(^|[_\s-])(avg|average|rate|ratio|pct|percent|percentage|price|score|satisfaction|rating|age|duration|minutes|hours|days|seconds|latency|margin|discount)($|[_\s-])/i;
export const aggregate = (c: ColumnProfile) => (AVERAGED.test(c.name) ? "avg" : "sum");
export const label = (c: ColumnProfile) => (aggregate(c) === "avg" ? `Average ${c.name}` : c.name);

export const isMeasure = (c: ColumnProfile, rows: number) =>
  c.type === "number" && !looksLikeId(c, rows) && c.distinct > 1;

export const isCategory = (c: ColumnProfile, rows: number) =>
  c.type === "string" && !looksLikeId(c, rows) && c.distinct > 1 && c.distinct <= MAX_CATEGORIES;

/** Rows per map bin below which a bin is not shown on a published map, so no single place can be picked out. */
export const MAP_MIN_ROWS = 5;
const MAP_MAX_BINS = 2000;

/**
 * A map of where the rows are. Points are counted into a grid whose cell is a fortieth of the area they cover, so a
 * city and a continent both read well, and the chart never holds more than a couple of thousand bins however many
 * rows there are. x is the longitude, y the latitude, n the number of rows in the bin.
 */
export function mapChart(lat: string, lon: string): Omit<ChartSpec, "id" | "layout"> {
  const la = q(lat);
  const lo = q(lon);
  const ok = `${la} IS NOT NULL AND ${lo} IS NOT NULL`;
  return {
    type: "map",
    title: "Where the rows are",
    query:
      `WITH r AS (SELECT greatest(max(${la}) - min(${la}), (max(${lo}) - min(${lo})) / 2, 0.01) / 40 AS c FROM data WHERE ${ok}) ` +
      `SELECT round(${lo} / c) * c AS x, round(${la} / c) * c AS y, count(*) AS n FROM data, r WHERE ${ok} GROUP BY 1, 2 ORDER BY n DESC LIMIT ${MAP_MAX_BINS}`,
    x: "x",
    y: ["y"],
  };
}

/** A world map with each country shaded by a measure (or by how many rows it has). The names are read by the renderer. */
export function regionsChart(column: string, measure?: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const col = q(column);
  const value = measure ? `${aggregate(measure)}(${q(measure.name)})` : "count(*)";
  return {
    type: "regions",
    title: measure ? `${label(measure)} by ${column}` : `Rows by ${column}`,
    query: `SELECT ${col} AS x, ${value} AS y FROM data WHERE ${col} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 300`,
    x: "x",
    y: ["y"],
  };
}

/** Drop the bins on a map that hold too few rows to publish. Other charts are returned as they are. */
export function applyPrivacyFloor<T extends Record<string, unknown>>(chart: Pick<ChartSpec, "type">, rows: T[]): T[] {
  return chart.type === "map" ? rows.filter((r) => Number(r.n) >= MAP_MIN_ROWS) : rows;
}

export function suggestDashboard(title: string, profile: TableProfile): DashboardSpec {
  const { rowCount: rows, columns } = profile;
  const measures = columns.filter((c) => isMeasure(c, rows));
  const categories = columns.filter((c) => isCategory(c, rows));
  const dates = columns.filter((c) => c.type === "date");

  const charts: ChartSpec[] = [];
  const add = (c: Omit<ChartSpec, "id" | "layout">) => {
    if (charts.length >= MAX_CHARTS) return;
    charts.push({ ...c, id: `c${charts.length + 1}`, layout: { x: 0, y: 0, w: 1, h: 1 } });
  };

  // KPIs: row count + totals of the first measures
  add({ type: "kpi", title: "Rows", query: "SELECT count(*) AS value FROM data" });
  for (const m of measures.slice(0, 2)) {
    add({
      type: "kpi",
      title: aggregate(m) === "avg" ? `Average ${m.name}` : `Total ${m.name}`,
      query: `SELECT ${aggregate(m)}(${q(m.name)}) AS value FROM data`,
    });
  }

  // Trend: first date x first measure
  if (dates[0] && measures[0]) {
    add({
      type: "line",
      title: `${label(measures[0])} over time`,
      query: `SELECT date_trunc('month', ${q(dates[0].name)}) AS x, ${aggregate(measures[0])}(${q(measures[0].name)}) AS y FROM data WHERE ${q(dates[0].name)} IS NOT NULL GROUP BY 1 ORDER BY 1`,
      x: "x",
      y: ["y"],
    });
  }

  // Places: a latitude and longitude pair becomes a map of where the rows are
  if (profile.coordinates) add(mapChart(profile.coordinates.lat, profile.coordinates.lon));

  if (profile.countries) add(regionsChart(profile.countries, measures[0]));

  // Category breakdowns
  for (const cat of categories.slice(0, 2)) {
    const value = measures[0] ? `${aggregate(measures[0])}(${q(measures[0].name)})` : "count(*)";
    const title = measures[0] ? `${label(measures[0])} by ${cat.name}` : `Rows by ${cat.name}`;
    add({
      type: "bar",
      title,
      query: `SELECT ${q(cat.name)} AS x, ${value} AS y FROM data GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_CATEGORIES}`,
      x: "x",
      y: ["y"],
    });
  }

  // Share of rows for a small category
  const small = categories.find((c) => c.distinct <= 6);
  if (small) {
    add({
      type: "pie",
      title: `Share of rows by ${small.name}`,
      query: `SELECT ${q(small.name)} AS x, count(*) AS y FROM data GROUP BY 1 ORDER BY 2 DESC`,
      x: "x",
      y: ["y"],
    });
  }

  // Relationship between two measures
  if (measures[0] && measures[1]) {
    const a = q(measures[0].name);
    const b = q(measures[1].name);
    add({
      type: "scatter",
      title: `${measures[0].name} vs ${measures[1].name}`,
      query: `SELECT ${a} AS x, ${b} AS y FROM data WHERE ${a} IS NOT NULL AND ${b} IS NOT NULL LIMIT 2000`,
      x: "x",
      y: ["y"],
    });
  }

  // Always give the user a way to see the rows
  add({ type: "table", title: "Data preview", query: "SELECT * FROM data LIMIT 100" });

  return {
    version: 1,
    title,
    schema: columns.map((c) => ({ name: c.name, type: c.type })),
    charts,
  };
}
