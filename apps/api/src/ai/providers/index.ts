import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createAiSdkService, type AiSdkOptions } from "../ai-sdk";
import type { AiService } from "../service";

type Env = Record<string, string | undefined>;

export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5";
export const GOOGLE_DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Work out which AI SDK model to use from environment variables. This is the only place that knows about vendors.
 *
 *   AI_PROVIDER         anthropic | google | none   (default: anthropic if ANTHROPIC_API_KEY is set, else google if GOOGLE_API_KEY is set)
 *   AI_MODEL            model name (defaults per provider; ANTHROPIC_MODEL still works)
 *
 *   google:
 *     AI_GOOGLE_BACKEND     vertex (default, billed to the Google Cloud project) | gemini-api (AI Studio keys)
 *     GOOGLE_API_KEY        optional on Vertex: with it, Vertex express mode; without it, the service's own identity
 *                           (Application Default Credentials: on Cloud Run give the service account the Vertex AI User role).
 *                           Required for gemini-api.
 *     GOOGLE_CLOUD_PROJECT  Vertex project when using the service identity
 *     AI_GOOGLE_LOCATION    Vertex location, default global
 *
 * Returns undefined when nothing usable is configured; the AI routes then answer 503.
 */
export function resolveAiOptions(env: Env = process.env, deps: { fetch?: typeof fetch } = {}): AiSdkOptions | undefined {
  const requested = env.AI_PROVIDER?.trim().toLowerCase();
  if (requested === "none") return undefined;
  const provider = requested ?? (env.ANTHROPIC_API_KEY ? "anthropic" : env.GOOGLE_API_KEY ? "google" : undefined);

  switch (provider) {
    case undefined:
      return undefined;

    case "anthropic": {
      if (!env.ANTHROPIC_API_KEY) {
        console.warn("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing: AI routes disabled");
        return undefined;
      }
      const modelName = env.AI_MODEL ?? env.ANTHROPIC_MODEL ?? ANTHROPIC_DEFAULT_MODEL;
      return {
        provider: "anthropic",
        modelName,
        model: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: deps.fetch })(modelName),
        // light task: low effort keeps it cheap
        providerOptions: { anthropic: { effort: "low" } },
        // the system prompt is the cacheable prefix
        systemProviderOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        secrets: [env.ANTHROPIC_API_KEY],
      };
    }

    case "google": {
      const modelName = env.AI_MODEL ?? GOOGLE_DEFAULT_MODEL;
      const backend = env.AI_GOOGLE_BACKEND === "gemini-api" ? "gemini-api" : "vertex";

      if (backend === "gemini-api") {
        if (!env.GOOGLE_API_KEY) {
          console.warn("AI_GOOGLE_BACKEND=gemini-api needs GOOGLE_API_KEY: AI routes disabled");
          return undefined;
        }
        return {
          provider: "google",
          modelName,
          model: createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY, fetch: deps.fetch })(modelName),
          secrets: [env.GOOGLE_API_KEY],
        };
      }

      if (env.GOOGLE_API_KEY) {
        const vertex = createVertex({ apiKey: env.GOOGLE_API_KEY, fetch: deps.fetch });
        return { provider: "google", modelName, model: vertex(modelName), secrets: [env.GOOGLE_API_KEY] };
      }
      // the service's own identity: Vertex needs to be told which project to bill
      const project = env.GOOGLE_CLOUD_PROJECT ?? env.GOOGLE_VERTEX_PROJECT;
      if (!project) {
        console.warn("AI_PROVIDER=google without GOOGLE_API_KEY needs GOOGLE_CLOUD_PROJECT: AI routes disabled");
        return undefined;
      }
      const vertex = createVertex({ project, location: env.AI_GOOGLE_LOCATION ?? "global", fetch: deps.fetch });
      return { provider: "google", modelName, model: vertex(modelName), secrets: [] };
    }

    default:
      console.warn(`Unknown AI_PROVIDER "${requested}": AI routes disabled`);
      return undefined;
  }
}

/** The AI service for this environment, or undefined when AI is not configured. */
export function createAiFromEnv(env: Env = process.env, deps: { fetch?: typeof fetch } = {}): AiService | undefined {
  const options = resolveAiOptions(env, deps);
  return options ? createAiSdkService(options) : undefined;
}
