export const MODEL_PROVIDER = "openrouter";
export const MODEL_ID = "deepseek/deepseek-v4-flash";
export const MODEL_REFERENCE = `${MODEL_PROVIDER}/${MODEL_ID}`;

export const MODEL_ARGS = ["--provider", MODEL_PROVIDER, "--model", MODEL_REFERENCE] as const;
