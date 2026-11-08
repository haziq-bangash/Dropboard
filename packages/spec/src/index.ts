import { z } from "zod";

export const ColumnType = z.enum(["number", "string", "date", "boolean"]);

export const ChartSpec = z.object({
  id: z.string(),
  type: z.enum(["bar", "line", "area", "pie", "scatter", "map", "regions", "histogram", "heatmap", "boxplot", "calendar", "treemap", "funnel", "sankey", "cities", "table", "kpi"]),
  title: z.string().max(120),
  // SQL run client-side in DuckDB-WASM against table "data"
  query: z.string().max(4000),
  x: z.string().optional(),
  y: z.array(z.string()).optional(),
  // a line chart with one line for each value of this column of the query's result (a company, a channel)
  group: z.string().optional(),
  // a region map draws countries on a world map (the default) or US states on a map of the United States
  map: z.enum(["world", "us"]).optional(),
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

// ---- Publishing (snapshot shares) ----

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const SHARE_MAX_ROWS_PER_CHART = 1000;

/** Precomputed chart results keyed by chart id. Never raw table data. */
export const ShareResults = z.record(z.string(), z.array(z.record(z.string(), Cell)).max(SHARE_MAX_ROWS_PER_CHART));

export const PublishInput = z.object({
  results: ShareResults,
  password: z.string().min(4).max(128).optional(),
});

export type ShareResults = z.infer<typeof ShareResults>;
export type PublishInput = z.infer<typeof PublishInput>;

// ---- AI requests (schema and stats only: never row values) ----

export const AiColumn = z.object({
  name: z.string().min(1).max(200),
  type: ColumnType,
  nullCount: z.number().int().nonnegative().optional(),
  distinct: z.number().int().nonnegative().optional(),
});

export const AiTable = z.object({
  rowCount: z.number().int().nonnegative(),
  columns: z.array(AiColumn).min(1).max(200),
});

export const GenerateInput = z.object({
  table: AiTable,
  // What the user wants, e.g. "focus on revenue by region". Optional for a first pass.
  instruction: z.string().trim().max(500).optional(),
  // When present, the model edits this dashboard instead of starting fresh.
  current: DashboardSpec.optional(),
});

export const AskInput = z.object({
  table: AiTable,
  question: z.string().trim().min(3).max(500),
});

// A question's query failed in the browser. The error text has already had quoted values removed (see scrubDbError).
export const RepairInput = z.object({
  table: AiTable,
  question: z.string().trim().min(3).max(500),
  sql: z.string().trim().min(1).max(4000),
  error: z.string().trim().min(1).max(400),
});

// The numbers behind each finding, with every value from the rows replaced by a placeholder (see narrateFindings in the engine).
export const NarrateInput = z.object({
  findings: z
    .array(
      z.object({
        id: z.string().min(1).max(8),
        kind: z.enum(["trend", "change", "outlier", "correlation", "dominance", "concentration", "missing", "seasonal", "latest", "duplicates", "leader", "standout", "entitytrend", "jump", "rankshift", "unusualrows", "contextual", "quality", "pareto", "retention", "cohorttrend"]),
        columns: z.array(z.string().max(200)).max(2),
        facts: z.record(z.string().max(40), z.number().finite()),
        tokens: z.array(z.enum(["{label}", "{at}", "{worstValue}", "{peak}", "{low}"])).max(5),
      }),
    )
    .min(1)
    .max(8),
});

export type AiTable = z.infer<typeof AiTable>;
export type NarrateInput = z.infer<typeof NarrateInput>;
export type RepairInput = z.infer<typeof RepairInput>;
export type GenerateInput = z.infer<typeof GenerateInput>;
export type AskInput = z.infer<typeof AskInput>;

// ---- Projects (a saved dashboard plus where its data came from) ----

export const ProjectSource = z.object({
  fileName: z.string().trim().min(1).max(200),
  rowCount: z.number().int().nonnegative(),
});

export const CreateProjectInput = z.object({
  spec: DashboardSpec,
  source: ProjectSource.optional(),
});

export const UpdateProjectInput = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    spec: DashboardSpec.optional(),
    source: ProjectSource.optional(),
  })
  .refine((v) => v.title !== undefined || v.spec !== undefined || v.source !== undefined, { message: "nothing to update" });

export type ProjectSource = z.infer<typeof ProjectSource>;
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;
