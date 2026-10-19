import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

export const MODEL_PROVIDER = "openrouter";
export const MODEL_ID = "deepseek/deepseek-v4.1-flash-1017";
export const MODEL_REFERENCE = `${MODEL_PROVIDER}/${MODEL_ID}`;

export const MODEL_ARGS = ["--provider", MODEL_PROVIDER, "--model", MODEL_REFERENCE] as const;

// pi 0.84.2 predates this snapshot. Register it locally before model resolution;
// do not rely on a user's cached catalog or a moving "latest" alias.
export const MODEL_CONFIG = {
  id: MODEL_ID,
  name: "DeepSeek: DeepSeek V4.1 Flash 1017",
  api: "openai-completions",
  baseUrl: "https://openrouter.ai/api/v1",
  reasoning: true,
  input: ["text", "image"],
  contextWindow: 1_048_576,
  maxTokens: 393_216,
  // Catalog peak USD / 1M tokens, not a quote for every routed provider.
  cost: { input: 0.30, output: 1.20, cacheRead: 0.006, cacheWrite: 0 },
  thinkingLevelMap: {
    minimal: "low", low: "low", medium: "high", high: "high", max: "max", xhigh: "max",
  },
  compat: {
    supportsDeveloperRole: false,
    thinkingFormat: "openrouter",
    requiresReasoningContentOnAssistantMessages: true,
  },
} satisfies NonNullable<Parameters<ModelRuntime["registerProvider"]>[1]["models"]>[number];
