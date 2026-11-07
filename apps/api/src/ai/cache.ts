import { createHash } from "node:crypto";
import type { GenerateInput } from "@dropboard/spec";
import { PROMPT_VERSION } from "./prompt";

/**
 * Cache key for a generated dashboard. Covers everything that changes the prompt:
 * prompt version, model, column names and types, the instruction and the current dashboard.
 * Row counts and per-column stats are left out on purpose so similar files share a result.
 */
export function generateCacheKey(model: string, input: GenerateInput): string {
  const payload = JSON.stringify([
    PROMPT_VERSION,
    model,
    input.table.columns.map((c) => [c.name, c.type]),
    input.instruction ?? "",
    input.current ? input.current.charts.map((c) => [c.type, c.title, c.query]) : null,
  ]);
  return createHash("sha256").update(payload).digest("hex");
}
