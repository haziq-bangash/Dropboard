import { z } from "zod/v4";

// What the model returns. The server fills in ids, layout, x/y and the table schema,
// so the model only has to get titles and SQL right.
export const AiChart = z.object({
  type: z.enum(["kpi", "bar", "line", "area", "pie", "scatter"]),
  title: z.string(),
  query: z.string(),
});

export const AiDashboardOutput = z.object({
  title: z.string(),
  charts: z.array(AiChart),
});

export const AiAskOutput = z.object({
  sql: z.string(),
  explanation: z.string(),
});

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
