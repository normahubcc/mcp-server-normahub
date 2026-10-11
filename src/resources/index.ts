/**
 * MCP Resources for NormaHub.
 * Exposes live model catalog and gateway operational status.
 */

import { apiClient } from "../client.js";
import { NORMAHUB_MODELS } from "../data/models.js";

export const RESOURCE_DEFINITIONS = [
  {
    uri: "normahub://models",
    name: "NormaHub 30 AI Models Catalog & Pricing",
    description: "Real-time catalog of 30 connected AI models (Claude 5.5, GPT-6 Sol, DeepSeek v4.1, SeeDance 2.5, Grok 4.7) with context limits, capabilities and pricing.",
    mimeType: "application/json",
  },
  {
    uri: "normahub://status",
    name: "NormaHub Gateway & Connectivity Status",
    description: "NormaHub API gateway health status, latency ping, active endpoints, and direct Russia routing info (No VPN required).",
    mimeType: "application/json",
  },
];

export async function handleReadResource(uri: string): Promise<any> {
  if (uri === "normahub://models") {
    // Generate both structured JSON representation and clean Markdown summary
    const modelsMarkdown = [
      "# NormaHub Active Models Catalog (30 Models)",
      "",
      "Direct API access to 30 frontier AI models without VPN, billed in rubles with RF cards / SBP.",
      "",
      "| Model ID | Provider | Context | Capabilities | Input / 1M | Output / 1M | Fixed |",
      "|---|---|---|---|---|---|---|",
      ...NORMAHUB_MODELS.map((m) => {
        const inPrice = m.pricing.inputPer1M || "-";
        const outPrice = m.pricing.outputPer1M || "-";
        const fixPrice = m.pricing.fixed || "-";
        return `| \`${m.id}\` | ${m.family} | ${m.context} | ${m.capabilities.join(", ")} | ${inPrice} | ${outPrice} | ${fixPrice} |`;
      }),
      "",
      "Official Catalog: https://normahub.cc/models",
    ].join("\n");

    const payload = {
      total_models: NORMAHUB_MODELS.length,
      gateway: "https://api.normahub.cc/v1",
      models: NORMAHUB_MODELS,
      markdown_summary: modelsMarkdown,
    };

    return {
      contents: [
        {
          uri: "normahub://models",
          mimeType: "application/json",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }

  if (uri === "normahub://status") {
    const status = await apiClient.getGatewayStatus();

    const statusMarkdown = [
      "# NormaHub Gateway Status",
      "",
      `- **Status:** ${status.status.toUpperCase()}`,
      `- **Ping Latency:** ${status.pingMs} ms`,
      `- **Base URL:** ${status.baseUrl}`,
      `- **Active Models:** ${status.activeModelsCount}`,
      `- **Direct Russian Routing (No VPN):** ${status.directRussianRouting ? "Enabled" : "Disabled"}`,
      `- **Ruble Billing / SBP / Mir:** ${status.rubleBilling ? "Active" : "Disabled"}`,
      `- **Checked At:** ${status.timestamp}`,
      "",
      "### API Endpoints",
      `- Chat Completions: \`${status.endpoints.chat}\``,
      `- Responses API (Streaming): \`${status.endpoints.responses}\``,
      `- Messages API (Claude): \`${status.endpoints.messages}\``,
      `- Video Generations: \`${status.endpoints.videos}\``,
      `- Video Task Status: \`${status.endpoints.videoStatus}\``,
      `- Image Generations: \`${status.endpoints.images}\``,
      `- Model Catalog: \`${status.endpoints.models}\``,
    ].join("\n");

    return {
      contents: [
        {
          uri: "normahub://status",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              ...status,
              markdown_summary: statusMarkdown,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`Resource with URI "${uri}" not found.`);
}
