import type { ChartSpec, DashboardSpec } from "@dropboard/spec";
import { q, type ColumnProfile, type TableProfile } from "./profile";

const MAX_CHARTS = 8;
const MAX_CATEGORIES = 20;

// Columns that look like identifiers make poor measures or categories.
const looksLikeId = (c: ColumnProfile, rows: number) =>
  /(^|_|\s)id$/i.test(c.name) || (c.type !== "number" && c.distinct >= rows * 0.9 && rows > 20);

const isMeasure = (c: ColumnProfile, rows: number) =>
  c.type === "number" && !looksLikeId(c, rows) && c.distinct > 1;

const isCategory = (c: ColumnProfile, rows: number) =>
  c.type === "string" && !looksLikeId(c, rows) && c.distinct > 1 && c.distinct <= MAX_CATEGORIES;

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
    add({ type: "kpi", title: `Total ${m.name}`, query: `SELECT sum(${q(m.name)}) AS value FROM data` });
  }

  // Trend: first date x first measure
  if (dates[0] && measures[0]) {
    add({
      type: "line",
      title: `${measures[0].name} over time`,
      query: `SELECT date_trunc('month', ${q(dates[0].name)}) AS x, sum(${q(measures[0].name)}) AS y FROM data WHERE ${q(dates[0].name)} IS NOT NULL GROUP BY 1 ORDER BY 1`,
      x: "x",
      y: ["y"],
    });
  }

  // Category breakdowns
  for (const cat of categories.slice(0, 2)) {
    const value = measures[0] ? `sum(${q(measures[0].name)})` : "count(*)";
    const label = measures[0] ? `${measures[0].name} by ${cat.name}` : `Rows by ${cat.name}`;
    add({
      type: "bar",
      title: label,
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
