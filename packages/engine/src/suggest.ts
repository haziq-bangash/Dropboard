import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import { q, type ColumnProfile, type TableProfile } from "./profile";

const MAX_CHARTS = 10;
const HISTOGRAM_BINS = 20;
const HEATMAP_MAX_SIDE = 12;
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

/**
 * How a measure is spread out: twenty equal bins from its lowest to its highest value, every bin present even when
 * empty so a gap shows as a gap. x is where a bin starts, w how wide it is, y how many rows fall in it.
 */
export function histogramChart(measure: string): Omit<ChartSpec, "id" | "layout"> {
  const m = q(measure);
  return {
    type: "histogram",
    title: `How ${measure} is spread out`,
    // count each row into its bin in one pass, then lay the twenty bins out so an empty one still shows as a gap
    query:
      `WITH r AS (SELECT min(${m}) AS lo, greatest(max(${m}) - min(${m}), 0.000000001) / ${HISTOGRAM_BINS} AS w FROM data WHERE ${m} IS NOT NULL), ` +
      `b AS (SELECT CAST(least(floor((${m} - lo) / w), ${HISTOGRAM_BINS - 1}) AS INTEGER) AS i, count(*) AS n FROM data, r WHERE ${m} IS NOT NULL GROUP BY 1) ` +
      `SELECT lo + t.i * w AS x, w AS w, CAST(coalesce(b.n, 0) AS BIGINT) AS y FROM r CROSS JOIN range(${HISTOGRAM_BINS}) AS t(i) LEFT JOIN b ON b.i = t.i ORDER BY t.i`,
    x: "x",
    y: ["y"],
  };
}

/**
 * How a measure is spread out within each group: the middle half of the values as a box, the median as a line, and
 * whiskers out to the furthest value within one and a half box-lengths. x is the group, y the median, n the rows in it.
 */
export function boxplotChart(category: string, measure: string): Omit<ChartSpec, "id" | "layout"> {
  const c = q(category);
  const m = q(measure);
  return {
    type: "boxplot",
    title: `How ${measure} varies by ${category}`,
    query:
      `WITH s AS (SELECT ${c} AS x, quantile_cont(${m}, 0.25) AS q1, quantile_cont(${m}, 0.5) AS y, quantile_cont(${m}, 0.75) AS q3, count(*) AS n FROM data WHERE ${c} IS NOT NULL AND ${m} IS NOT NULL GROUP BY 1) ` +
      `SELECT s.x, s.y, min(d.${m}) FILTER (WHERE d.${m} >= s.q1 - 1.5 * (s.q3 - s.q1)) AS low, s.q1, s.q3, ` +
      `max(d.${m}) FILTER (WHERE d.${m} <= s.q3 + 1.5 * (s.q3 - s.q1)) AS high, s.n ` +
      `FROM s JOIN data d ON d.${c} = s.x AND d.${m} IS NOT NULL GROUP BY s.x, s.y, s.q1, s.q3, s.n ORDER BY s.y DESC LIMIT 20`,
    x: "x",
    y: ["y"],
  };
}

/** Fewest different days a date column needs before a calendar of it is worth drawing. */
const CALENDAR_MIN_DAYS = 60;

/**
 * A calendar with one cell per day, shaded by how many rows fall on it, over the latest twelve months of the data.
 * It counts rows and does not add up a measure, so a day with a single row shows that something happened and never
 * what its value was. x is the day as text (yyyy-mm-dd), y the number of rows.
 */
export function calendarChart(date: string): Omit<ChartSpec, "id" | "layout"> {
  const d = q(date);
  return {
    type: "calendar",
    title: `Rows per day by ${date}`,
    query:
      `WITH days AS (SELECT CAST(${d} AS DATE) AS day FROM data WHERE ${d} IS NOT NULL) ` +
      `SELECT strftime(day, '%Y-%m-%d') AS x, count(*) AS y FROM days WHERE day >= (SELECT max(day) FROM days) - INTERVAL 365 DAY GROUP BY 1 ORDER BY 1`,
    x: "x",
    y: ["y"],
  };
}

/** Two categories against each other, each cell shaded by a measure (or by how many rows fall in it). */
export function heatmapChart(a: string, b: string, measure?: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const value = measure ? `${aggregate(measure)}(${q(measure.name)})` : "count(*)";
  return {
    type: "heatmap",
    title: measure ? `${label(measure)} by ${a} and ${b}` : `Rows by ${a} and ${b}`,
    query: `SELECT ${q(a)} AS x, ${q(b)} AS y, ${value} AS value FROM data WHERE ${q(a)} IS NOT NULL AND ${q(b)} IS NOT NULL GROUP BY 1, 2`,
    x: "x",
    y: ["y"],
  };
}

/**
 * A map with each country (or, with `map: "us"`, each US state) shaded by a measure or by how many rows it has.
 * The names are read by the renderer, which accepts names, codes and common spellings.
 */
export function regionsChart(column: string, measure?: ColumnProfile, map: "world" | "us" = "world"): Omit<ChartSpec, "id" | "layout"> {
  const col = q(column);
  const value = measure ? `${aggregate(measure)}(${q(measure.name)})` : "count(*)";
  return {
    type: "regions",
    title: measure ? `${label(measure)} by ${column}` : `Rows by ${column}`,
    query: `SELECT ${col} AS x, ${value} AS y FROM data WHERE ${col} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 300`,
    x: "x",
    y: ["y"],
    ...(map === "us" ? { map } : {}),
  };
}

const total = (measure?: ColumnProfile) => (measure ? `${aggregate(measure)}(${q(measure.name)})` : "count(*)");

/**
 * Tiles sized by a measure (or by how many rows), one per value of a category. With a second text column each tile is
 * split into its parts, so a total can be read down two levels. x is the category, child the second level, y the size.
 */
export function treemapChart(category: string, measure?: ColumnProfile, child?: string): Omit<ChartSpec, "id" | "layout"> {
  const v = total(measure);
  const c = q(category);
  const what = measure ? label(measure) : "Rows";
  return {
    type: "treemap",
    title: child ? `${what} by ${category} and ${child}` : `${what} by ${category}`,
    query: child
      ? `SELECT ${c} AS x, ${q(child)} AS child, ${v} AS y FROM data WHERE ${c} IS NOT NULL AND ${q(child)} IS NOT NULL GROUP BY 1, 2 HAVING ${v} > 0 ORDER BY 3 DESC LIMIT 200`
      : `SELECT ${c} AS x, ${v} AS y FROM data WHERE ${c} IS NOT NULL GROUP BY 1 HAVING ${v} > 0 ORDER BY 2 DESC LIMIT 40`,
    x: "x",
    y: ["y"],
  };
}

/** Stages from the biggest to the smallest, drawn as a narrowing funnel: each value of a stage column with its size. */
export function funnelChart(stage: string, measure?: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const v = total(measure);
  const c = q(stage);
  return {
    type: "funnel",
    title: `${measure ? label(measure) : "Rows"} by ${stage}`,
    query: `SELECT ${c} AS x, ${v} AS y FROM data WHERE ${c} IS NOT NULL GROUP BY 1 HAVING ${v} > 0 ORDER BY 2 DESC LIMIT 12`,
    x: "x",
    y: ["y"],
  };
}

/**
 * Where things go from one category to another: bands from each value of one column to each value of another, as wide
 * as the measure (or the count of rows). x is where it starts, target where it ends, y the size and n the rows behind it,
 * so a band over a handful of rows can be left out of a published copy.
 */
export function sankeyChart(from: string, to: string, measure?: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const v = total(measure);
  const a = q(from);
  const b = q(to);
  return {
    type: "sankey",
    title: `${measure ? label(measure) : "Rows"} from ${from} to ${to}`,
    query: `SELECT ${a} AS x, ${b} AS target, ${v} AS y, count(*) AS n FROM data WHERE ${a} IS NOT NULL AND ${b} IS NOT NULL GROUP BY 1, 2 HAVING ${v} > 0 ORDER BY 3 DESC LIMIT 60`,
    x: "x",
    y: ["y"],
  };
}

/**
 * Drop the bins on a map, the groups in a box plot and the bands in a flow diagram that hold too few rows to publish: a
 * box or a band over one or two rows would show the values themselves. Other charts are returned as they are.
 */
export function applyPrivacyFloor<T extends Record<string, unknown>>(chart: Pick<ChartSpec, "type">, rows: T[]): T[] {
  return chart.type === "map" || chart.type === "boxplot" || chart.type === "sankey" ? rows.filter((r) => Number(r.n) >= MAP_MIN_ROWS) : rows;
}

export function suggestDashboard(title: string, profile: TableProfile): DashboardSpec {
  const { rowCount: rows, columns } = profile;
  // a latitude or longitude is a position, not an amount: adding them up or averaging them means nothing
  const measures = columns.filter((c) => isMeasure(c, rows) && c.name !== profile.coordinates?.lat && c.name !== profile.coordinates?.lon);
  const categories = columns.filter((c) => isCategory(c, rows));
  const dates = columns.filter((c) => c.type === "date");

  const charts: ChartSpec[] = [];
  const add = (c: Omit<ChartSpec, "id" | "layout">) => {
    // up to ten charts, and always one more place for the data preview, so a rich file never pushes it out
    if (charts.length >= (c.type === "table" ? MAX_CHARTS + 1 : MAX_CHARTS)) return;
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

  if (profile.states) add(regionsChart(profile.states, measures[0], "us"));
  else if (profile.countries) add(regionsChart(profile.countries, measures[0]));

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

  // How the main measure is spread out, when it takes enough different values to have a shape
  const spread = measures.find((m) => m.distinct > HISTOGRAM_BINS);
  if (spread) add(histogramChart(spread.name));

  // How that measure differs between groups, when there is a small category to split it by
  const groups = categories.find((c) => c.distinct >= 2 && c.distinct <= HEATMAP_MAX_SIDE);
  if (spread && groups) add(boxplotChart(groups.name, spread.name));

  // Two categories against each other
  const sides = categories.filter((c) => c.distinct <= HEATMAP_MAX_SIDE);
  if (sides.length >= 2) add(heatmapChart(sides[0].name, sides[1].name, measures[0]));

  // Which days are busy, when a date column covers enough days to show a pattern
  if (dates[0] && dates[0].distinct >= CALENDAR_MIN_DAYS) add(calendarChart(dates[0].name));

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
