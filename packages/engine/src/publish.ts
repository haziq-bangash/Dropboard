import type { DashboardSpec } from "@dropboard/spec";

/**
 * Remove charts that expose raw rows (the data preview table) before a dashboard is published.
 * Published snapshots contain only aggregates and bounded chart samples.
 */
export function publishableSpec(spec: DashboardSpec): DashboardSpec {
  return { ...spec, charts: spec.charts.filter((c) => c.type !== "table") };
}
