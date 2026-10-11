/**
 * NormaHub MCP Server Configuration
 */

export const CONFIG = {
  apiKey: process.env.NORMAHUB_API_KEY || "",
  baseUrl: (process.env.NORMAHUB_BASE_URL || "https://api.normahub.cc/v1").replace(/\/+$/, ""),
  defaultModel: process.env.NORMAHUB_DEFAULT_MODEL || "claude-sonnet-5-5",
  timeoutMs: 120_000,
};

export function validateConfig(): void {
  if (!CONFIG.apiKey) {
    console.error(
      "[NormaHub MCP Error] NORMAHUB_API_KEY is not set.\n" +
      "Please set NORMAHUB_API_KEY in your MCP client configuration (Claude Desktop, Cursor, etc.).\n" +
      "Get your key at: https://normahub.cc"
    );
  }
}
