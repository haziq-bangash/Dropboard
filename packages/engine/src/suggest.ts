import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import { q, type ColumnProfile, type TableProfile } from "./profile";
import { periodOrderSql } from "./periods";
import { aggregateFor, looksLikeId, measureKind, timeColumn, timeExpression, valueKind } from "./understand";

const MAX_CHARTS = 10;
const HISTOGRAM_BINS = 20;
const HEATMAP_MAX_SIDE = 12;
const MAX_CATEGORIES = 20;

export const aggregate = (c: ColumnProfile) => aggregateFor(valueKind(c));
export const label = (c: ColumnProfile) => (aggregate(c) === "avg" ? `Average ${c.name}` : c.name);

export const isMeasure = (c: ColumnProfile, rows: number) => measureKind(c, rows) !== null;

const isLongText = (c: ColumnProfile) => (c.textLength ?? 0) > 40;

/** A text column with a few values: good for splitting a measure, a share, a heatmap. */
export const isCategory = (c: ColumnProfile, rows: number) =>
  c.type === "string" && !looksLikeId(c, rows) && !isLongText(c) && c.distinct > 1 && c.distinct <= MAX_CATEGORIES;

/** A text column with too many values to draw them all, but few enough that its top values mean something. */
export const isRanking = (c: ColumnProfile, rows: number) =>
  c.type === "string" && !looksLikeId(c, rows) && !isLongText(c) && c.distinct > MAX_CATEGORIES && c.distinct <= MAX_RANKING && c.distinct <= rows * 0.5;

const MAX_RANKING = 500;

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

/** Most lines drawn on one chart: more than this cannot be told apart. */
const PANEL_LINES = 8;

interface PanelCtx {
  entity: string;
  time: { column: ColumnProfile; kind: "date" | "year" | "period" };
}

/** The time of each row at the grain a panel chart uses: the year itself, or the month of a date. */
const panelAxis = (t: PanelCtx["time"]) => (t.kind === "year" ? timeExpression(t.column, "year") : `date_trunc('month', ${timeExpression(t.column, t.kind)})`);

/**
 * The latest period that most entities reported. The very last period is often only partly in, which would make a total or a
 * ranking there look like a collapse. This finds the last one with at least four fifths of the entities.
 */
const latestFullPeriod = (p: PanelCtx) =>
  `per AS (SELECT ${panelAxis(p.time)} AS t, count(DISTINCT ${q(p.entity)}) AS n FROM data WHERE ${q(p.time.column.name)} IS NOT NULL GROUP BY 1), ` +
  `last AS (SELECT max(t) AS t FROM per WHERE n >= 0.8 * (SELECT max(n) FROM per))`;

/** One line for each of the biggest entities, over time, for one measure. */
export function entityLinesChart(p: PanelCtx, measure: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const e = q(p.entity);
  const m = q(measure.name);
  const agg = aggregate(measure);
  return {
    type: "line",
    title: `${label(measure)} by ${p.entity} over time`,
    query:
      `WITH top AS (SELECT ${e} AS e FROM data WHERE ${e} IS NOT NULL GROUP BY 1 ORDER BY ${agg}(${m}) DESC LIMIT ${PANEL_LINES}) ` +
      `SELECT ${panelAxis(p.time)} AS x, ${e} AS g, ${agg}(${m}) AS y FROM data WHERE ${q(p.time.column.name)} IS NOT NULL AND ${e} IN (SELECT e FROM top) GROUP BY 1, 2 ORDER BY 2, 1`,
    x: "x",
    y: ["y"],
    group: "g",
  };
}

/** The entities ranked by a measure in the latest period most of them reported. */
export function latestRankingChart(p: PanelCtx, measure: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const e = q(p.entity);
  const m = q(measure.name);
  return {
    type: "bar",
    title: `${label(measure)} by ${p.entity}, latest full ${p.time.kind === "year" ? "year" : "month"}`,
    query:
      `WITH ${latestFullPeriod(p)} SELECT ${e} AS x, ${aggregate(measure)}(${m}) AS y FROM data WHERE ${e} IS NOT NULL AND ${panelAxis(p.time)} = (SELECT t FROM last) GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_CATEGORIES}`,
    x: "x",
    y: ["y"],
  };
}

/** How many entities there are. */
export function entityCountKpi(p: PanelCtx): Omit<ChartSpec, "id" | "layout"> {
  return { type: "kpi", title: `${p.entity} count`, query: `SELECT count(DISTINCT ${q(p.entity)}) AS value FROM data` };
}

/** The measure's total (or average) over all entities in the latest full period. */
export function latestPeriodKpi(p: PanelCtx, measure: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  return {
    type: "kpi",
    title: `${aggregate(measure) === "avg" ? "Average " : "Total "}${measure.name}, latest full ${p.time.kind === "year" ? "year" : "month"}`,
    query: `WITH ${latestFullPeriod(p)} SELECT ${aggregate(measure)}(${q(measure.name)}) AS value FROM data WHERE ${panelAxis(p.time)} = (SELECT t FROM last)`,
  };
}

/** Entities down the side, years across the top, each cell shaded by a measure. Only for years, which are few and whole. */
export function entityYearHeatmap(p: PanelCtx, measure: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const e = q(p.entity);
  return {
    type: "heatmap",
    title: `${label(measure)} by ${p.entity} and ${p.time.column.name}`,
    query: `SELECT CAST(CAST(${q(p.time.column.name)} AS INTEGER) AS VARCHAR) AS x, ${e} AS y, ${aggregate(measure)}(${q(measure.name)}) AS value FROM data WHERE ${e} IS NOT NULL AND ${q(p.time.column.name)} IS NOT NULL GROUP BY 1, 2`,
    x: "x",
    y: ["y"],
  };
}

/** How to order a category's bars: months, weekdays and quarters follow the calendar, everything else goes biggest first. */
const barOrder = (c: ColumnProfile) => {
  const calendar = c.period ? periodOrderSql(c.period, q(c.name)) : null;
  return calendar ? `min(${calendar})` : "2 DESC";
};

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
 * Bubbles on a world map, one per city, sized by a measure or by how many rows the city has. The renderer looks each name
 * up in the city list. x is the city name, y the size and n the rows behind it, so a city with a few rows can be left out
 * of a published copy.
 */
export function citiesChart(column: string, measure?: ColumnProfile): Omit<ChartSpec, "id" | "layout"> {
  const c = q(column);
  return {
    type: "cities",
    title: measure ? `${label(measure)} by ${column}` : `Rows by ${column}`,
    query: `SELECT ${c} AS x, ${total(measure)} AS y, count(*) AS n FROM data WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 300`,
    x: "x",
    y: ["y"],
  };
}

/**
 * Drop the bins on a map, the groups in a box plot, the bands in a flow diagram and the cities that hold too few rows to publish: a
 * box or a band over one or two rows would show the values themselves. Other charts are returned as they are.
 */
export function applyPrivacyFloor<T extends Record<string, unknown>>(chart: Pick<ChartSpec, "type">, rows: T[]): T[] {
  return chart.type === "map" || chart.type === "boxplot" || chart.type === "sankey" || chart.type === "cities" ? rows.filter((r) => Number(r.n) >= MAP_MIN_ROWS) : rows;
}

export function suggestDashboard(title: string, profile: TableProfile): DashboardSpec {
  const { rowCount: rows, columns } = profile;
  // a latitude or longitude is a position, not an amount: adding them up or averaging them means nothing
  // amounts first (they add up), then levels, then rates: the first measures are the ones shown biggest
  const order = { flow: 0, level: 1, rate: 2 } as const;
  const measures = columns
    // a column that is mostly empty is a poor thing to total or plot against another: the Insights tab reports its gaps instead
    .filter((c) => isMeasure(c, rows) && c.nullCount <= rows * 0.7 && c.name !== profile.coordinates?.lat && c.name !== profile.coordinates?.lon)
    .map((c, i) => ({ c, i, k: order[valueKind(c)] }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.c);
  const categories = columns.filter((c) => isCategory(c, rows));
  const rankings = columns.filter((c) => isRanking(c, rows));
  const dates = columns.filter((c) => c.type === "date");
  const time = timeColumn(profile);

  const charts: ChartSpec[] = [];
  const add = (c: Omit<ChartSpec, "id" | "layout">) => {
    // up to ten charts, and always one more place for the data preview, so a rich file never pushes it out
    if (charts.length >= (c.type === "table" ? MAX_CHARTS + 1 : MAX_CHARTS)) return;
    charts.push({ ...c, id: `c${charts.length + 1}`, layout: { x: 0, y: 0, w: 1, h: 1 } });
  };

  // One row per entity per period (a company by year): each entity's own story, and who leads, in place of the totals of a plain table
  const panel: PanelCtx | null = profile.panel && time && time.column.name === profile.panel.time ? { entity: profile.panel.entity, time } : null;
  if (panel && measures.length) {
    const kind = (k: "flow" | "level" | "rate") => measures.filter((c) => valueKind(c) === k);
    const [flows, levels, rates] = [kind("flow"), kind("level"), kind("rate")];
    const main = flows[0] ?? levels[0] ?? rates[0];
    const second = flows[1] ?? levels[0] ?? rates[0];
    const ratio = rates[0] ?? levels[0];
    const entity = columns.find((c) => c.name === panel.entity)!;

    add(entityCountKpi(panel));
    add(latestPeriodKpi(panel, main));
    if (second && second !== main) add(latestPeriodKpi(panel, second));
    add(entityLinesChart(panel, main));
    add(latestRankingChart(panel, main));
    if (ratio && ratio !== main) {
      add(entityLinesChart(panel, ratio));
      add({
        type: "bar",
        title: `${label(ratio)} by ${panel.entity}`,
        query: `SELECT ${q(panel.entity)} AS x, ${aggregate(ratio)}(${q(ratio.name)}) AS y FROM data WHERE ${q(panel.entity)} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_CATEGORIES}`,
        x: "x",
        y: ["y"],
      });
    }
    if (panel.time.kind === "year" && panel.time.column.distinct <= 20 && entity.distinct <= 20) add(entityYearHeatmap(panel, main));
    const group = categories.find((c) => c.name !== panel.entity);
    if (group) {
      add({
        type: "bar",
        title: `${label(main)} by ${group.name}`,
        query: `SELECT ${q(group.name)} AS x, ${aggregate(main)}(${q(main.name)}) AS y FROM data GROUP BY 1 ORDER BY ${barOrder(group)} LIMIT ${MAX_CATEGORIES}`,
        x: "x",
        y: ["y"],
      });
    }
    if (second && second !== main) {
      const a = q(main.name);
      const b = q(second.name);
      add({ type: "scatter", title: `${main.name} vs ${second.name}`, query: `SELECT ${a} AS x, ${b} AS y FROM data WHERE ${a} IS NOT NULL AND ${b} IS NOT NULL LIMIT 2000`, x: "x", y: ["y"] });
    }
    if (main.distinct > HISTOGRAM_BINS) add(histogramChart(main.name));
    add({ type: "table", title: "Data preview", query: "SELECT * FROM data LIMIT 100" });
    return { version: 1, title, schema: columns.map((c) => ({ name: c.name, type: c.type })), charts };
  }

  // KPIs: row count + totals of the first measures
  add({ type: "kpi", title: profile.sample ? "Rows in the sample" : "Rows", query: "SELECT count(*) AS value FROM data" });
  for (const m of measures.slice(0, 2)) {
    add({
      type: "kpi",
      title: aggregate(m) === "avg" ? `Average ${m.name}` : `Total ${m.name}`,
      query: `SELECT ${aggregate(m)}(${q(m.name)}) AS value FROM data`,
    });
  }


  // Trend: the time axis (dates, or a year stored as a number) x the first measure
  if (time && measures[0]) {
    const axis = time.kind === "year" ? timeExpression(time.column, "year") : `date_trunc('month', ${timeExpression(time.column, time.kind)})`;
    // "over time" only for a column that is the time of things happening: a year a house was built is a way to group, not a clock
    const clock = time.kind !== "year" || /^(year|yr|fy|fiscal year|season|period)$/i.test(time.column.name.trim());
    add({
      type: "line",
      title: clock ? `${label(measures[0])} over time` : `${label(measures[0])} by ${time.column.name}`,
      query: `SELECT ${axis} AS x, ${aggregate(measures[0])}(${q(measures[0].name)}) AS y FROM data WHERE ${q(time.column.name)} IS NOT NULL GROUP BY 1 ORDER BY 1`,
      x: "x",
      y: ["y"],
    });
  }

  // Places: a latitude and longitude pair becomes a map of where the rows are
  if (profile.coordinates) add(mapChart(profile.coordinates.lat, profile.coordinates.lon));

  if (profile.states) add(regionsChart(profile.states, measures[0], "us"));
  else if (profile.countries) add(regionsChart(profile.countries, measures[0]));
  if (profile.cities) add(citiesChart(profile.cities, measures[0]));

  // Category breakdowns
  for (const cat of categories.slice(0, 2)) {
    const value = measures[0] ? `${aggregate(measures[0])}(${q(measures[0].name)})` : "count(*)";
    const title = measures[0] ? `${label(measures[0])} by ${cat.name}` : `Rows by ${cat.name}`;
    add({
      type: "bar",
      title,
      query: `SELECT ${q(cat.name)} AS x, ${value} AS y FROM data GROUP BY 1 ORDER BY ${barOrder(cat)} LIMIT ${MAX_CATEGORIES}`,
      x: "x",
      y: ["y"],
    });
  }

  // A text column with too many values to show them all: its top twenty
  const many = rankings[0];
  if (many) {
    const value = measures[0] ? `${aggregate(measures[0])}(${q(measures[0].name)})` : "count(*)";
    add({
      type: "bar",
      title: measures[0] ? `${label(measures[0])} by ${many.name}, top ${MAX_CATEGORIES}` : `Rows by ${many.name}, top ${MAX_CATEGORIES}`,
      query: `SELECT ${q(many.name)} AS x, ${value} AS y FROM data WHERE ${q(many.name)} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ${MAX_CATEGORIES}`,
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
