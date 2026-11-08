import { guardSql, tidySql } from "@dropboard/engine";
import { DashboardSpec, type AiTable } from "@dropboard/spec";
import { AiBadOutput, type AiDashboardOutput } from "./schema";

const MAX_CHARTS = 12;

export interface Dropped {
  title: string;
  reason: string;
}

/**
 * Turn untrusted model output into a validated DashboardSpec.
 * Every query must pass the SQL guard; charts that don't are dropped and reported.
 * The table schema comes from the request, never from the model.
 */
export function buildSpec(table: AiTable, output: AiDashboardOutput): { spec: DashboardSpec; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const charts: DashboardSpec["charts"] = [];

  for (const c of output.charts) {
    if (charts.length >= MAX_CHARTS) break;
    const guarded = guardSql(c.query);
    if (!guarded.ok) {
      dropped.push({ title: c.title, reason: guarded.reason });
      continue;
    }
    const title = c.title.trim().slice(0, 120) || "Untitled";
    charts.push({
      id: `c${charts.length + 1}`,
      type: c.type,
      title,
      query: tidySql(c.query).trim().replace(/;+\s*$/, ""),
      ...(c.type === "kpi" ? {} : { x: "x", y: ["y"] }),
      layout: { x: 0, y: 0, w: 1, h: 1 },
    });
  }

  if (charts.length === 0) throw new AiBadOutput("No valid charts in the model output");

  const spec = DashboardSpec.parse({
    version: 1,
    title: output.title.trim().slice(0, 120) || "Dashboard",
    schema: table.columns.map((c) => ({ name: c.name, type: c.type })),
    charts,
  });
  return { spec, dropped };
}
