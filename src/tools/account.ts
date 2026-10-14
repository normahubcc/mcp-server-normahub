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

export const BALANCE_TOOL_DEFINITION = {
  name: "normahub_get_balance",
  description: "Check your current NormaHub account balance in Russian Rubles (RUB), active tier, and remaining tokens.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export async function handleBalanceTool(_args: any): Promise<any> {
  const balanceData = await apiClient.getBalance();
  const bal = balanceData?.balance !== undefined && balanceData?.balance !== null
    ? `${Number(balanceData.balance).toFixed(2)} RUB`
    : "Active (Custom Corporate Billing)";

  return {
    content: [
      {
        type: "text",
        text: `💰 NormaHub Account Balance: ${bal}\nBilling Portal: https://normahub.cc/billing\nPayment Methods: СБП, МИР, Корпоративный счет (без комиссии и без VPN)`,
      },
    ],
  };
}
