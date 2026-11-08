import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import type { ColumnProfile, TableProfile } from "./profile";
import type { PlaceKind } from "./places";
import { MAX_CITIES } from "./cities";
import { citiesChart, funnelChart, isMeasure, regionsChart, sankeyChart, treemapChart } from "./suggest";

/**
 * Small, exact edits to a saved dashboard, for the cases where automatic detection gets a place wrong: take a map off,
 * or draw one for a column the profiler did not recognise. All pure, so the same code runs in the browser and in tests.
 */


/** Most distinct values a place column can have: a region map shades each one. */
const MAX_PLACES = 300;

/** Text columns a person could choose as a column of places. */
export function placeColumnChoices(profile: TableProfile): ColumnProfile[] {
  return profile.columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= MAX_PLACES);
}

const nextId = (spec: DashboardSpec) => {
  const used = new Set(spec.charts.map((c) => c.id));
  let n = spec.charts.length + 1;
  while (used.has(`c${n}`)) n++;
  return `c${n}`;
};

/** Take one chart off the dashboard. The last chart cannot be removed, since a dashboard needs something to show. */
export function removeChart(spec: DashboardSpec, id: string): DashboardSpec {
  if (spec.charts.length <= 1 || !spec.charts.some((c) => c.id === id)) return spec;
  return { ...spec, charts: spec.charts.filter((c) => c.id !== id) };
}

/**
 * Add a shaded map for a column the person says holds countries or US states. The first measure is shaded when there is
 * one, otherwise the count of rows. Returns the new dashboard, or a short reason it was not added.
 */
export function addPlaceChart(spec: DashboardSpec, profile: TableProfile, kind: PlaceKind, column: string): DashboardSpec | string {
  const col = profile.columns.find((c) => c.name === column);
  if (!col || col.type !== "string") return `${column} is not a text column`;
  if (col.distinct > MAX_PLACES) return `${column} has too many different values for a map`;
  const measure = profile.columns.find(
    (c) => isMeasure(c, profile.rowCount) && c.name !== profile.coordinates?.lat && c.name !== profile.coordinates?.lon,
  );
  const built = regionsChart(column, measure, kind === "us-state" ? "us" : "world");
  if (spec.charts.some((c) => c.type === "regions" && c.query === built.query && (c.map ?? "world") === (built.map ?? "world"))) {
    return `${column} is already mapped on this dashboard`;
  }
  return insertChart(spec, built);
}

/** Text columns a person could choose as a column of cities. */
export function cityColumnChoices(profile: TableProfile): ColumnProfile[] {
  return profile.columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= MAX_CITIES);
}

/** Add a city map for a column the person says holds cities. Returns the new dashboard, or a short reason it was not added. */
export function addCityChart(spec: DashboardSpec, profile: TableProfile, column: string): DashboardSpec | string {
  const col = profile.columns.find((c) => c.name === column);
  if (!col || col.type !== "string") return `${column} is not a text column`;
  if (col.distinct > MAX_CITIES) return `${column} has too many different values for a map`;
  const measure = profile.columns.find((c) => isMeasure(c, profile.rowCount) && c.name !== profile.coordinates?.lat && c.name !== profile.coordinates?.lon);
  const built = citiesChart(column, measure);
  if (spec.charts.some((c) => c.type === "cities" && c.query === built.query)) return `${column} is already mapped on this dashboard`;
  return insertChart(spec, built);
}

/** Put a new chart on the dashboard, above the data preview when there is one. */
function insertChart(spec: DashboardSpec, built: Omit<ChartSpec, "id" | "layout">): DashboardSpec {
  const chart: ChartSpec = { ...built, id: nextId(spec), layout: { x: 0, y: 0, w: 1, h: 1 } };
  const last = spec.charts.at(-1);
  if (last?.type === "table") return { ...spec, charts: [...spec.charts.slice(0, -1), chart, last] };
  return { ...spec, charts: [...spec.charts, chart] };
}

/** A chart a person asks for by choosing columns. */
export type ChartRequest =
  | { type: "treemap"; category: string; child?: string; measure?: string }
  | { type: "funnel"; stage: string; measure?: string }
  | { type: "sankey"; from: string; to: string; measure?: string };

/** Most different values a text column can have for each of these charts and still read well. */
export const CHART_LIMITS = { treemap: 40, funnel: 12, sankey: 25 } as const;

/** Text columns that suit a chart type: a few distinct values, but more than one. */
export function textChoices(profile: TableProfile, type: ChartRequest["type"]): ColumnProfile[] {
  return profile.columns.filter((c) => c.type === "string" && c.distinct >= 2 && c.distinct <= CHART_LIMITS[type]);
}

/** Number columns a chart can be sized by. Latitude and longitude are positions, not amounts. */
export function measureChoices(profile: TableProfile): ColumnProfile[] {
  return profile.columns.filter((c) => c.type === "number" && c.name !== profile.coordinates?.lat && c.name !== profile.coordinates?.lon);
}

/** Add a treemap, funnel or flow diagram for the chosen columns. Returns the new dashboard, or a short reason it was not added. */
export function addRequestedChart(spec: DashboardSpec, profile: TableProfile, request: ChartRequest): DashboardSpec | string {
  const column = (name: string | undefined) => profile.columns.find((c) => c.name === name);
  const text = (name: string | undefined, label: string) => {
    const c = column(name);
    if (!c || c.type !== "string") return `Choose a text column for ${label}.`;
    if (c.distinct > CHART_LIMITS[request.type]) return `${c.name} has too many different values for this chart.`;
    return c;
  };
  const measure = request.measure ? column(request.measure) : undefined;
  if (request.measure && (!measure || measure.type !== "number")) return `${request.measure} is not a number column.`;

  let built: Omit<ChartSpec, "id" | "layout">;
  if (request.type === "treemap") {
    const a = text(request.category, "the groups");
    if (typeof a === "string") return a;
    if (request.child) {
      const b = text(request.child, "the split");
      if (typeof b === "string") return b;
      if (b.name === a.name) return "Choose two different columns.";
    }
    built = treemapChart(a.name, measure, request.child);
  } else if (request.type === "funnel") {
    const a = text(request.stage, "the stages");
    if (typeof a === "string") return a;
    built = funnelChart(a.name, measure);
  } else {
    const a = text(request.from, "where it starts");
    if (typeof a === "string") return a;
    const b = text(request.to, "where it ends");
    if (typeof b === "string") return b;
    if (a.name === b.name) return "Choose two different columns.";
    built = sankeyChart(a.name, b.name, measure);
  }
  if (spec.charts.some((c) => c.type === built.type && c.query === built.query)) return "That chart is already on this dashboard.";
  return insertChart(spec, built);
}
