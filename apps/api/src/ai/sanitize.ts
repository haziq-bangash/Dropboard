import { guardSql, boxplotChart, calendarChart, funnelChart, heatmapChart, histogramChart, mapChart, regionsChart, sankeyChart, treemapChart, tidySql, type ColumnProfile } from "@dropboard/engine";
import { DashboardSpec, type AiTable } from "@dropboard/spec";
import { AiBadOutput, SPECIAL_CHARTS, type AiChartInput, type AiDashboardInput } from "./schema";

const MAX_CHARTS = 12;

export interface Dropped {
  title: string;
  reason: string;
}

// the most groups a heatmap side or a box plot can show and stay readable
const HEATMAP_MAX_SIDE = 25;
// a treemap tile per value, and a funnel stage per value, stay readable only up to about this many
const TREEMAP_MAX = 40;
const FUNNEL_MAX = 12;

type Built = Omit<DashboardSpec["charts"][number], "id" | "layout">;

/**
 * A chart type that is described by columns, not written as SQL. Returns the chart, or the reason it cannot be drawn.
 * The names must be real columns of the right type, so nothing the model typed ever reaches a query unchecked.
 */
function fromColumns(table: AiTable, c: AiChartInput): Built | string {
  const names = c.columns ?? [];
  const find = (name: string | undefined) => table.columns.find((col) => col.name === name);
  const profile = (name: string): ColumnProfile => {
    const col = find(name)!;
    return { name: col.name, type: col.type, nullCount: col.nullCount ?? 0, distinct: col.distinct ?? 0 };
  };
  const need = (n: number) => (names.length < n ? `${c.type} needs ${n} column name${n === 1 ? "" : "s"}` : null);
  const isType = (name: string, type: "number" | "string") => find(name)?.type === type;
  const missing = names.find((n) => !find(n));
  if (missing !== undefined) return `no column called ${missing}`;

  switch (c.type) {
    case "histogram": {
      const e = need(1);
      if (e) return e;
      return isType(names[0], "number") ? histogramChart(names[0]) : `${names[0]} is not a number column`;
    }
    case "heatmap": {
      const e = need(2);
      if (e) return e;
      if (!isType(names[0], "string") || !isType(names[1], "string")) return "a heatmap needs two text columns";
      if ((find(names[0])?.distinct ?? 0) > HEATMAP_MAX_SIDE || (find(names[1])?.distinct ?? 0) > HEATMAP_MAX_SIDE) return "a heatmap needs columns with few distinct values";
      if (names[2] !== undefined && !isType(names[2], "number")) return `${names[2]} is not a number column`;
      return heatmapChart(names[0], names[1], names[2] ? profile(names[2]) : undefined);
    }
    case "boxplot": {
      const e = need(2);
      if (e) return e;
      if (!isType(names[0], "string")) return `${names[0]} is not a text column`;
      if (!isType(names[1], "number")) return `${names[1]} is not a number column`;
      if ((find(names[0])?.distinct ?? 0) > HEATMAP_MAX_SIDE) return "a box plot needs a column with few distinct values";
      return boxplotChart(names[0], names[1]);
    }
    case "statemap": {
      const e = need(1);
      if (e) return e;
      if (!isType(names[0], "string")) return `${names[0]} is not a text column`;
      if (names[1] !== undefined && !isType(names[1], "number")) return `${names[1]} is not a number column`;
      return regionsChart(names[0], names[1] ? profile(names[1]) : undefined, "us");
    }
    case "calendar": {
      const e = need(1);
      if (e) return e;
      return find(names[0])?.type === "date" ? calendarChart(names[0]) : `${names[0]} is not a date column`;
    }
    case "treemap": {
      const e = need(1);
      if (e) return e;
      if (!isType(names[0], "string")) return `${names[0]} is not a text column`;
      if ((find(names[0])?.distinct ?? 0) > TREEMAP_MAX) return "a treemap needs a column with fewer different values";
      // [category], then optionally [second text column] and [measure], in either order
      const child = names[1] !== undefined && isType(names[1], "string") ? names[1] : undefined;
      const measure = [names[1], names[2]].find((n) => n !== undefined && isType(n, "number"));
      if (names[1] !== undefined && !child && !measure) return `${names[1]} is neither a text nor a number column`;
      if (child && (find(child)?.distinct ?? 0) > TREEMAP_MAX) return "a treemap needs a second column with fewer different values";
      if (child === names[0]) return "a treemap needs two different columns";
      return treemapChart(names[0], measure ? profile(measure) : undefined, child);
    }
    case "funnel": {
      const e = need(1);
      if (e) return e;
      if (!isType(names[0], "string")) return `${names[0]} is not a text column`;
      if ((find(names[0])?.distinct ?? 0) > FUNNEL_MAX) return "a funnel needs a column with few stages (12 at most)";
      if (names[1] !== undefined && !isType(names[1], "number")) return `${names[1]} is not a number column`;
      return funnelChart(names[0], names[1] ? profile(names[1]) : undefined);
    }
    case "sankey": {
      const e = need(2);
      if (e) return e;
      if (!isType(names[0], "string") || !isType(names[1], "string")) return "a flow diagram needs two text columns";
      if (names[0] === names[1]) return "a flow diagram needs two different columns";
      if ((find(names[0])?.distinct ?? 0) > HEATMAP_MAX_SIDE || (find(names[1])?.distinct ?? 0) > HEATMAP_MAX_SIDE) return "a flow diagram needs columns with few distinct values";
      if (names[2] !== undefined && !isType(names[2], "number")) return `${names[2]} is not a number column`;
      return sankeyChart(names[0], names[1], names[2] ? profile(names[2]) : undefined);
    }
    case "map": {
      const e = need(2);
      if (e) return e;
      return isType(names[0], "number") && isType(names[1], "number") ? mapChart(names[0], names[1]) : "a map needs a latitude and a longitude number column";
    }
    case "regions": {
      const e = need(1);
      if (e) return e;
      if (!isType(names[0], "string")) return `${names[0]} is not a text column`;
      if (names[1] !== undefined && !isType(names[1], "number")) return `${names[1]} is not a number column`;
      return regionsChart(names[0], names[1] ? profile(names[1]) : undefined);
    }
    default:
      return `${c.type} is not built from columns`;
  }
}

/**
 * Turn untrusted model output into a validated DashboardSpec.
 * Every query must pass the SQL guard; charts that don't are dropped and reported.
 * The table schema comes from the request, never from the model.
 */
export function buildSpec(table: AiTable, output: AiDashboardInput): { spec: DashboardSpec; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const charts: DashboardSpec["charts"] = [];

  for (const c of output.charts) {
    if (charts.length >= MAX_CHARTS) break;
    if ((SPECIAL_CHARTS as readonly string[]).includes(c.type)) {
      const built = fromColumns(table, c);
      if (typeof built === "string") {
        dropped.push({ title: c.title, reason: built });
        continue;
      }
      charts.push({
        id: `c${charts.length + 1}`,
        ...built,
        title: c.title.trim().slice(0, 120) || built.title,
        layout: { x: 0, y: 0, w: 1, h: 1 },
      });
      continue;
    }
    const guarded = guardSql(c.query);
    if (!guarded.ok) {
      dropped.push({ title: c.title, reason: guarded.reason });
      continue;
    }
    const title = c.title.trim().slice(0, 120) || "Untitled";
    charts.push({
      id: `c${charts.length + 1}`,
      type: c.type as "kpi" | "bar" | "line" | "area" | "pie" | "scatter",
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
