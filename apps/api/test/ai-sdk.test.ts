import type { GenerateInput } from "@dropboard/spec";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiSdkService, type AiSdkOptions } from "../src/ai/ai-sdk";
import { SYSTEM } from "../src/ai/prompt";
import { createAiFromEnv, resolveAiOptions } from "../src/ai/providers";
import { AiBadOutput, AiProviderError, AiRefusal } from "../src/ai/schema";
import { modelId } from "../src/ai/service";

const input: GenerateInput = {
  table: { rowCount: 10, columns: [{ name: "region", type: "string", nullCount: 0, distinct: 3 }, { name: "amount", type: "number" }] },
  instruction: "focus on revenue",
};
const dashboard = { title: "Revenue", charts: [{ type: "kpi", title: "Rows", query: "SELECT count(*) AS value FROM data" }] };

const usage = (input = 700, output = 350, cacheRead = 20) => ({
  inputTokens: { total: input, noCache: input - cacheRead, cacheRead, cacheWrite: undefined },
  outputTokens: { total: output, text: output - 50, reasoning: 50 },
});
const result = (text: string, finish: "stop" | "content-filter" | "length" = "stop") => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: finish, raw: finish },
  usage: usage(),
  warnings: [],
});

function service(doGenerate: ConstructorParameters<typeof MockLanguageModelV4>[0] extends infer O ? (O extends { doGenerate?: infer D } ? D : never) : never, extra: Partial<AiSdkOptions> = {}) {
  const model = new MockLanguageModelV4({ provider: "mock", modelId: "mock-1", doGenerate });
  return { model, ai: createAiSdkService({ provider: "mock", modelName: "mock-1", model, ...extra }) };
}

describe("AI SDK service", () => {
  it("returns the parsed output and normalised usage", async () => {
    const { ai } = service(result(JSON.stringify(dashboard)));
    const out = await ai.generate(input);
    expect(out.output).toEqual(dashboard);
    expect(out.usage).toEqual({ inputTokens: 700, outputTokens: 350, cacheReadTokens: 20 });
    expect(modelId(ai)).toBe("mock/mock-1");
  });

  it("sends the system prompt, a schema-only user message and a JSON schema", async () => {
    const { ai, model } = service(result(JSON.stringify(dashboard)));
    await ai.generate(input);

    const call = model.doGenerateCalls[0];
    const prompt = JSON.stringify(call.prompt);
    expect(prompt).toContain(SYSTEM.slice(0, 60));
    expect(prompt).toContain("Instruction: focus on revenue");
    expect(prompt).toContain('\\"region\\"');
    expect(call.responseFormat?.type).toBe("json");
    const schema = (call.responseFormat as { schema?: { properties?: Record<string, unknown> } }).schema;
    expect(Object.keys(schema?.properties ?? {})).toEqual(["title", "charts"]);
    expect(call.maxOutputTokens).toBe(16000);
    // the system prompt comes first, so providers that cache can cache it
    expect(call.prompt[0].role).toBe("system");
  });

  it("passes provider options and system-prompt options through untouched", async () => {
    const { ai, model } = service(result(JSON.stringify(dashboard)), {
      providerOptions: { mock: { effort: "low" } },
      systemProviderOptions: { mock: { cacheControl: { type: "ephemeral" } } },
    });
    await ai.generate(input);
    const call = model.doGenerateCalls[0];
    expect(call.providerOptions).toMatchObject({ mock: { effort: "low" } });
    expect(call.prompt[0].providerOptions).toMatchObject({ mock: { cacheControl: { type: "ephemeral" } } });
  });

  it("answers questions with the ask prompt and schema", async () => {
    const { ai, model } = service(result(JSON.stringify({ sql: "SELECT 1", explanation: "One." })));
    const out = await ai.ask({ table: input.table, question: "how many rows?" });
    expect(out.output).toEqual({ sql: "SELECT 1", explanation: "One." });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("Question: how many rows?");
  });

  it("treats a content filter as a refusal", async () => {
    const { ai } = service(result("", "content-filter"));
    await expect(ai.generate(input)).rejects.toThrow(AiRefusal);
  });

  it("rejects output that is not valid JSON or does not match the schema", async () => {
    await expect(service(result("not json")).ai.generate(input)).rejects.toThrow(AiBadOutput);
    await expect(service(result(JSON.stringify({ title: 5 }))).ai.generate(input)).rejects.toThrow(AiBadOutput);
    await expect(service(result('{"title":"x","charts":[', "length")).ai.generate(input)).rejects.toThrow(AiBadOutput);
  });

  it("reports API errors as provider errors, scrubbing secrets", async () => {
    const { ai } = service(
      async () => {
        throw new APICallError({
          message: "API key AQ.super-secret is invalid, token ya29.abc.def",
          url: "https://example.test",
          requestBodyValues: {},
          statusCode: 403,
          isRetryable: false,
        });
      },
      { secrets: ["AQ.super-secret"] },
    );
    const error = await ai.generate(input).catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.status).toBe(403);
    expect(error.message).toContain("403");
    expect(error.message).not.toContain("AQ.super-secret");
    expect(error.message).not.toContain("ya29.abc.def");
  });

  it("reports timeouts and unexpected failures as provider errors", async () => {
    const hang = service(({ abortSignal }) => new Promise((_, reject) => abortSignal?.addEventListener("abort", () => reject(abortSignal.reason))), { timeoutMs: 50 });
    const timedOut = await hang.ai.generate(input).catch((e) => e);
    expect(timedOut).toBeInstanceOf(AiProviderError);
    expect(timedOut.message).toContain("timed out");

    const broken = service(async () => {
      throw new TypeError("fetch failed");
    });
    const failed = await broken.ai.generate(input).catch((e) => e);
    expect(failed).toBeInstanceOf(AiProviderError);
    expect(failed.message).toContain("fetch failed");
  });
});

describe("provider selection", () => {
  beforeEach(() => void vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  const pick = (env: Record<string, string>) => {
    const o = resolveAiOptions(env);
    return o ? `${o.provider}/${o.modelName}` : undefined;
  };

  it("is off when nothing is configured or when switched off", () => {
    expect(pick({})).toBeUndefined();
    expect(pick({ AI_PROVIDER: "none", ANTHROPIC_API_KEY: "k", GOOGLE_API_KEY: "k" })).toBeUndefined();
    expect(createAiFromEnv({})).toBeUndefined();
  });

  it("picks Anthropic from its key, with model overrides", () => {
    expect(pick({ ANTHROPIC_API_KEY: "k" })).toBe("anthropic/claude-haiku-5-5");
    expect(pick({ ANTHROPIC_API_KEY: "k", AI_MODEL: "claude-sonnet-5-5" })).toBe("anthropic/claude-sonnet-5-5");
    expect(pick({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "legacy-name" })).toBe("anthropic/legacy-name");
  });

  it("picks Google from its key, or from the service identity when asked", () => {
    expect(pick({ GOOGLE_API_KEY: "k" })).toBe("google/gemini-3.5-flash-lite");
    expect(pick({ AI_PROVIDER: "google", GOOGLE_CLOUD_PROJECT: "p" })).toBe("google/gemini-3.5-flash-lite");
    expect(pick({ AI_PROVIDER: "google", GOOGLE_VERTEX_PROJECT: "p", AI_MODEL: "gemini-x" })).toBe("google/gemini-x");
  });

  it("lets AI_PROVIDER win when both keys are present, and prefers Anthropic otherwise", () => {
    const both = { ANTHROPIC_API_KEY: "a", GOOGLE_API_KEY: "g" };
    expect(pick(both)).toBe("anthropic/claude-haiku-5-5");
    expect(pick({ ...both, AI_PROVIDER: "google" })).toBe("google/gemini-3.5-flash-lite");
  });

  it("stays off, with a warning, when the chosen provider is missing what it needs", () => {
    expect(pick({ AI_PROVIDER: "anthropic" })).toBeUndefined();
    expect(pick({ AI_PROVIDER: "google", AI_GOOGLE_BACKEND: "gemini-api" })).toBeUndefined();
    expect(pick({ AI_PROVIDER: "google" })).toBeUndefined(); // service identity, but no project to bill
    expect(pick({ AI_PROVIDER: "openai" })).toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(4);
  });

  it("builds models that carry the chosen model id", () => {
    expect((resolveAiOptions({ GOOGLE_API_KEY: "k", AI_MODEL: "gemini-x" })!.model as { modelId: string }).modelId).toBe("gemini-x");
    expect((resolveAiOptions({ ANTHROPIC_API_KEY: "k" })!.model as { modelId: string }).modelId).toBe("claude-haiku-5-5");
  });

  it("scrubs the configured key from errors", () => {
    expect(resolveAiOptions({ GOOGLE_API_KEY: "AQ.key" })!.secrets).toEqual(["AQ.key"]);
    expect(resolveAiOptions({ AI_PROVIDER: "google", GOOGLE_CLOUD_PROJECT: "p" })!.secrets).toEqual([]);
  });

  it("gives Anthropic a cached system prompt and low effort, and Google neither", () => {
    const a = resolveAiOptions({ ANTHROPIC_API_KEY: "k" })!;
    expect(a.providerOptions).toEqual({ anthropic: { effort: "low" } });
    expect(a.systemProviderOptions).toEqual({ anthropic: { cacheControl: { type: "ephemeral" } } });
    const g = resolveAiOptions({ GOOGLE_API_KEY: "k" })!;
    expect(g.providerOptions).toBeUndefined();
    expect(g.systemProviderOptions).toBeUndefined();
  });
});

/** A fetch that records the request and returns a minimal valid answer in the right wire format. */
function recordingFetch(body: unknown) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    calls.push({ url: String(url), headers, body: String(init?.body ?? "") });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

describe("what each setup sends over the wire", () => {
  const geminiReply = {
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(dashboard) }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 300, thoughtsTokenCount: 50, cachedContentTokenCount: 20 },
  };

  it("Vertex express mode: key in a header, nothing secret in the URL or body", async () => {
    const { fn, calls } = recordingFetch(geminiReply);
    const ai = createAiFromEnv({ GOOGLE_API_KEY: "AQ.test-key" }, { fetch: fn })!;
    const out = await ai.generate(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("aiplatform.googleapis.com");
    expect(calls[0].url).toContain("gemini-3.5-flash-lite:generateContent");
    expect(calls[0].url).not.toContain("AQ.test-key");
    expect(calls[0].body).not.toContain("AQ.test-key");
    expect(calls[0].headers["x-goog-api-key"]).toBe("AQ.test-key");
    expect(out.output).toEqual(dashboard);
    // thinking tokens are part of the output count
    expect(out.usage).toEqual({ inputTokens: 700, outputTokens: 350, cacheReadTokens: 20 });
  });

  it("Gemini API backend", async () => {
    const { fn, calls } = recordingFetch(geminiReply);
    const ai = createAiFromEnv({ GOOGLE_API_KEY: "AQ.test-key", AI_GOOGLE_BACKEND: "gemini-api", AI_MODEL: "gemini-y" }, { fetch: fn })!;
    await ai.generate(input);
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
    expect(calls[0].url).toContain("gemini-y:generateContent");
    expect(calls[0].url).not.toContain("AQ.test-key");
    expect(calls[0].headers["x-goog-api-key"]).toBe("AQ.test-key");
  });

  it("Anthropic: key in a header, cache marker on the system prompt, low effort", async () => {
    const reply = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: JSON.stringify(dashboard) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 700, output_tokens: 300, cache_read_input_tokens: 20 },
    };
    const { fn, calls } = recordingFetch(reply);
    const ai = createAiFromEnv({ ANTHROPIC_API_KEY: "sk-ant-test" }, { fetch: fn })!;
    await ai.generate(input);

    expect(calls[0].url).toContain("api.anthropic.com");
    expect(calls[0].headers["x-api-key"]).toBe("sk-ant-test");
    expect(calls[0].body).not.toContain("sk-ant-test");
    expect(calls[0].body).toContain('"cache_control"');
    expect(calls[0].body).toContain('"effort":"low"');
  });
});
