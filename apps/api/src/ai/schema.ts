import { z } from "zod";

// What the model returns. The server fills in ids, layout, x/y and the table schema,
// so the model only has to get titles and SQL right.
// histogram, heatmap, boxplot, calendar, map and regions are not written as SQL by the model: it names the columns, and the server builds
// the query with the same tested builders the automatic dashboard uses.
export const SPECIAL_CHARTS = ["histogram", "heatmap", "map", "regions", "boxplot", "calendar", "statemap", "treemap", "funnel", "sankey", "cities"] as const;

export const AiChart = z.object({
  type: z.enum(["kpi", "bar", "line", "area", "pie", "scatter", ...SPECIAL_CHARTS]),
  title: z.string(),
  /** SQL for kpi, bar, line, area, pie and scatter. An empty string for the four chart types that use columns. */
  query: z.string(),
  /** Column names for histogram, heatmap, map and regions. An empty list (or null) for the other types. */
  columns: z.array(z.string()).nullable(),
});

/** What the server accepts: the same as the model's answer, but a chart may leave out `columns` (older callers and tests). */
export type AiChartInput = Omit<z.infer<typeof AiChart>, "columns"> & { columns?: string[] | null };
export type AiDashboardInput = { title: string; charts: AiChartInput[] };

export const AiDashboardOutput = z.object({
  title: z.string(),
  charts: z.array(AiChart),
});

export const AiAskOutput = z.object({
  sql: z.string(),
  explanation: z.string(),
});

export const AiNarrateOutput = z.object({
  items: z.array(z.object({ id: z.string(), headline: z.string(), sentence: z.string(), next: z.string() })),
});

export type AiNarrateOutput = z.infer<typeof AiNarrateOutput>;
export type AiDashboardOutput = z.infer<typeof AiDashboardOutput>;
export type AiAskOutput = z.infer<typeof AiAskOutput>;

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export class AiRefusal extends Error {
  constructor() {
    super("The model declined this request");
  }
}

export class AiBadOutput extends Error {
  constructor(message = "The model did not return a usable result") {
    super(message);
  }
}

/** The provider could not be reached or answered with an error (not a refusal, not a bad answer). */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
