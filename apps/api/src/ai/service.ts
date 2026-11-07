import type { AskInput, GenerateInput } from "@dropboard/spec";
import type { AiAskOutput, AiDashboardOutput, AiUsage } from "./schema";

/**
 * What the rest of the API knows about an AI provider. Providers live in ./providers and are chosen from the
 * environment by createAiFromEnv, so routes, caching, quotas and usage logging never mention a vendor.
 */
export interface AiService {
  /** Short vendor name, e.g. "anthropic" or "google". */
  readonly provider: string;
  /** Model name within that vendor. */
  readonly model: string;
  generate(input: GenerateInput): Promise<{ output: AiDashboardOutput; usage: AiUsage }>;
  ask(input: AskInput): Promise<{ output: AiAskOutput; usage: AiUsage }>;
}

/** Stable identifier for cache keys and the usage log, e.g. "google/gemini-3.5-flash-lite". */
export const modelId = (ai: Pick<AiService, "provider" | "model">) => `${ai.provider}/${ai.model}`;
