import { APICallError, generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { ASK_SYSTEM, NARRATE_SYSTEM, REPAIR_SYSTEM, SYSTEM, askMessage, generateMessage, narrateMessage, repairMessage } from "./prompt";
import { AiAskOutput, AiBadOutput, AiDashboardOutput, AiNarrateOutput, AiProviderError, AiRefusal, type AiUsage } from "./schema";
import type { AiService } from "./service";

type CallOptions = Parameters<typeof generateText>[0];

export interface AiSdkOptions {
  /** Short vendor label for cache keys and the usage log, e.g. "google". */
  provider: string;
  /** Model name within that vendor. */
  modelName: string;
  /** Any Vercel AI SDK language model: Vertex, Gemini API, Anthropic, the AI Gateway, a mock in tests... */
  model: LanguageModel;
  /** Provider-specific call options, e.g. { anthropic: { effort: "low" } }. */
  providerOptions?: CallOptions["providerOptions"];
  /** Provider-specific options for the system prompt, e.g. a prompt-cache marker. */
  systemProviderOptions?: CallOptions["providerOptions"];
  /** Secrets to scrub from error messages. */
  secrets?: string[];
  timeoutMs?: number;
}

/**
 * The one AiService implementation. It is written against the Vercel AI SDK, so which vendor runs is decided
 * entirely by the model passed in (see providers/index.ts). Structured output, usage and failure handling are
 * the same for every provider, and tools, approval steps and multi-step loops can be added here without touching routes.
 */
export function createAiSdkService(o: AiSdkOptions): AiService {
  const redact = (text: string) => {
    let out = text;
    for (const secret of o.secrets ?? []) if (secret) out = out.split(secret).join("***");
    return out.replace(/ya29\.[\w.-]+/g, "***").replace(/\s+/g, " ").slice(0, 200);
  };

  function mapError(e: unknown): Error {
    if (e instanceof AiRefusal || e instanceof AiBadOutput || e instanceof AiProviderError) return e;
    if (NoObjectGeneratedError.isInstance(e)) {
      return e.finishReason === "content-filter" ? new AiRefusal() : new AiBadOutput(`${o.provider} output did not match the schema`);
    }
    if (APICallError.isInstance(e)) {
      return new AiProviderError(`${o.provider} returned ${e.statusCode ?? "an error"}: ${redact(e.message)}`, e.statusCode);
    }
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return new AiProviderError(`${o.provider} timed out`);
    }
    return new AiProviderError(`${o.provider} request failed: ${redact(e instanceof Error ? e.message : String(e))}`);
  }

  async function call<T>(system: string, user: string, schema: z.ZodType<T>): Promise<{ output: T; usage: AiUsage }> {
    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await generateText({
        model: o.model,
        // The stable system prompt goes first: it is the cacheable prefix on providers that cache.
        instructions: { role: "system", content: system, providerOptions: o.systemProviderOptions },
        prompt: user,
        output: Output.object({ schema }),
        // generous: some models count their thinking against this limit
        maxOutputTokens: 16000,
        providerOptions: o.providerOptions,
        abortSignal: AbortSignal.timeout(o.timeoutMs ?? 45_000),
        maxRetries: 2,
      });
    } catch (e) {
      throw mapError(e);
    }

    if (result.finishReason === "content-filter") throw new AiRefusal();
    if (result.finishReason === "length") throw new AiBadOutput(`${o.provider} output was cut off`);

    let output: unknown;
    try {
      output = result.output;
    } catch {
      throw new AiBadOutput(`${o.provider} returned no structured output`);
    }

    const u = result.usage;
    const usage: AiUsage = {
      inputTokens: u.inputTokens ?? 0,
      // includes reasoning tokens, which providers bill as output
      outputTokens: u.outputTokens ?? 0,
      cacheReadTokens: u.inputTokenDetails.cacheReadTokens ?? 0,
    };
    return { output: output as T, usage };
  }

  return {
    provider: o.provider,
    model: o.modelName,
    generate: (input) => call(SYSTEM, generateMessage(input), AiDashboardOutput),
    narrate: (input) => call(NARRATE_SYSTEM, narrateMessage(input.findings), AiNarrateOutput),
    repair: (input) => call(REPAIR_SYSTEM, repairMessage(input.table, input.question, input.sql, input.error), AiAskOutput),
    ask: (input) => call(ASK_SYSTEM, askMessage(input.table, input.question), AiAskOutput),
  };
}
