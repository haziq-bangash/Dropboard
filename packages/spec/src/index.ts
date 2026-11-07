import { z } from "zod";

export const ColumnType = z.enum(["number", "string", "date", "boolean"]);

export const ChartSpec = z.object({
  id: z.string(),
  type: z.enum(["bar", "line", "area", "pie", "scatter", "table", "kpi"]),
  title: z.string().max(120),
  // SQL run client-side in DuckDB-WASM against table "data"
  query: z.string().max(4000),
  x: z.string().optional(),
  y: z.array(z.string()).optional(),
  layout: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
});

export const DashboardSpec = z.object({
  version: z.literal(1),
  title: z.string().max(120),
  schema: z.array(z.object({ name: z.string(), type: ColumnType })),
  charts: z.array(ChartSpec).max(50),
});

export type DashboardSpec = z.infer<typeof DashboardSpec>;
export type ChartSpec = z.infer<typeof ChartSpec>;
export type ColumnType = z.infer<typeof ColumnType>;
