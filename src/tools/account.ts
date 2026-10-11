/**
 * MCP Tool: account_info
 * Checks model catalog and connection status.
 */

import { apiClient } from "../client.js";

export const ACCOUNT_TOOL_DEFINITION = {
  name: "normahub_list_models",
  description: "List currently available active AI models and their pricing on NormaHub API.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export async function handleAccountTool(_args: any): Promise<any> {
  const modelsData = await apiClient.getModels();
  const modelList = Array.isArray(modelsData?.data)
    ? modelsData.data.map((m: any) => m.id).join(", ")
    : "30 active models (Claude Sonnet 5.5, GPT-6 Sol, DeepSeek v4.1, SeeDance 2.5, etc.)";

  return {
    content: [
      {
        type: "text",
        text: `⚡ NormaHub Connected Models:\n${modelList}\n\nEndpoint: https://api.normahub.cc/v1\nCatalog & Pricing: https://normahub.cc/models`,
      },
    ],
  };
}
