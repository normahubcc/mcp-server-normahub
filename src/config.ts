/**
 * Runtime configuration, read once from the environment of the MCP client.
 */

function integerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CONFIG = {
  apiKey: process.env.NORMAHUB_API_KEY?.trim() ?? "",
  baseUrl: (process.env.NORMAHUB_BASE_URL?.trim() || "https://api.normahub.cc/v1").replace(/\/+$/, ""),
  defaultModel: process.env.NORMAHUB_DEFAULT_MODEL?.trim() || "claude-sonnet-5-5",
  /** Text calls can legitimately take a minute on large prompts. */
  timeoutMs: integerFromEnv("NORMAHUB_TIMEOUT_MS", 120_000),
};

/**
 * A missing key is not fatal: the catalog tools and resources work without it,
 * and an agent gets a precise error only when it tries a paid call.
 */
export function validateConfig(): void {
  if (!CONFIG.apiKey) {
    console.error(
      "[NormaHub MCP] NORMAHUB_API_KEY is not set. Model listing works, but chat, image, video " +
        "and audio calls will fail. Set the key in the MCP client configuration; issue it at https://normahub.cc/dashboard."
    );
  }
  try {
    new URL(CONFIG.baseUrl);
  } catch {
    console.error(
      `[NormaHub MCP] NORMAHUB_BASE_URL is not a valid URL: ${CONFIG.baseUrl}. Falling back to https://api.normahub.cc/v1.`
    );
    CONFIG.baseUrl = "https://api.normahub.cc/v1";
  }
}