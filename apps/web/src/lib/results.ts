import { guardSql } from "@dropboard/engine";
import type { ChartSpec, DashboardSpec, ShareResults } from "@dropboard/spec";
import { SHARE_MAX_ROWS_PER_CHART } from "@dropboard/spec";
import { runQuery } from "./duckdb";

export type Rows = Record<string, unknown>[];
export type RowSource = (chart: ChartSpec) => Promise<Rows>;

/** Run a chart's query against the in-browser DuckDB table (guarded, read-only). */
export const liveSource: RowSource = async (chart) => {
  const guarded = guardSql(chart.query);
  if (!guarded.ok) throw new Error(guarded.reason);
  return runQuery(guarded.sql);
};

/** Serve rows from a published snapshot. No database, no DuckDB. */
export const snapshotSource =
  (results: ShareResults): RowSource =>
  async (chart) =>
    results[chart.id] ?? [];

type Cell = string | number | boolean | null;

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

/** Precompute every chart's result for publishing. Only aggregates and previews leave the browser. */
export async function collectResults(spec: DashboardSpec): Promise<ShareResults> {
  const entries = await Promise.all(
    spec.charts.map(async (chart) => {
      const rows = (await liveSource(chart)).slice(0, SHARE_MAX_ROWS_PER_CHART);
      return [chart.id, rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toCell(v)])))] as const;
    }),
  );
  return Object.fromEntries(entries);
}
