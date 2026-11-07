import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AskInput, GenerateInput } from "@dropboard/spec";
import { ASK_SYSTEM, SYSTEM, askMessage, generateMessage } from "./prompt";
import {
  AiAskOutput,
  AiBadOutput,
  AiDashboardOutput,
  AiRefusal,
  type AiUsage,
} from "./schema";

export interface AiService {
  readonly model: string;
  generate(input: GenerateInput): Promise<{ output: AiDashboardOutput; usage: AiUsage }>;
  ask(input: AskInput): Promise<{ output: AiAskOutput; usage: AiUsage }>;
}

type ParseClient = Pick<Anthropic, "messages">;

export const DEFAULT_MODEL = "claude-haiku-5-5";

export function createAnthropicAi(client: ParseClient, model: string = DEFAULT_MODEL): AiService {
  async function call<T extends typeof AiDashboardOutput | typeof AiAskOutput>(
    system: string,
    user: string,
    schema: T,
  ) {
    const res = await client.messages.parse({
      model,
      max_tokens: 16000,
      // Stable system prompt first: it is the cacheable prefix.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      // Light task: low effort keeps cost down. Structured output guarantees parseable JSON.
      output_config: { effort: "low", format: zodOutputFormat(schema) },
    });

    if (res.stop_reason === "refusal") throw new AiRefusal();
    if (!res.parsed_output) throw new AiBadOutput();

    const usage: AiUsage = {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    };
    return { output: res.parsed_output as T extends typeof AiDashboardOutput ? AiDashboardOutput : AiAskOutput, usage };
  }

  return {
    model,
    generate: (input) => call(SYSTEM, generateMessage(input), AiDashboardOutput),
    ask: (input) => call(ASK_SYSTEM, askMessage(input.table, input.question), AiAskOutput),
  };
}
