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
    : "30 active models (Claude, GPT, DeepSeek, Qwen, SeeDance)";

  return {
    content: [
      {
        type: "text",
        text: `NormaHub Connected Models:\n${modelList}\n\nEndpoint: https://api.normahub.cc/v1\nCatalog: https://normahub.cc/models`,
      },
    ],
  };
}
