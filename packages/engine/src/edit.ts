import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import type { ColumnProfile, TableProfile } from "./profile";
import type { PlaceKind } from "./places";
import { isMeasure, regionsChart } from "./suggest";

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
  const chart: ChartSpec = { ...built, id: nextId(spec), layout: { x: 0, y: 0, w: 1, h: 1 } };
  // the data preview stays last
  const last = spec.charts.at(-1);
  if (last?.type === "table") return { ...spec, charts: [...spec.charts.slice(0, -1), chart, last] };
  return { ...spec, charts: [...spec.charts, chart] };
}
