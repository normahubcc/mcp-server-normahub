/**
 * MCP resources.
 *
 * `normahub://models` now renders the live catalog. The previous version
 * returned a bundled array titled "30 Models" while the gateway served 34 and
 * no longer served the SeeDance models that the array advertised.
 */

import { apiClient } from "../client.js";
import {
  formatPrice,
  loadCatalog,
  type Catalog,
  type CatalogModel,
} from "../catalog.js";

export const RESOURCE_DEFINITIONS = [
  {
    uri: "normahub://models",
    name: "NormaHub model catalog",
    description:
      "Live catalog of available models: id, vendor, modality, context window, capabilities, prices. " +
      "Refreshed from the public endpoint every 10 minutes.",
    mimeType: "application/json",
  },
  {
    uri: "normahub://status",
    name: "NormaHub gateway status",
    description: "Reachability of the gateway, latency of a models call, and the endpoints in use.",
    mimeType: "application/json",
  },
];

function markdownTable(catalog: Catalog): string {
  const line = (model: CatalogModel): string => {
    const context = model.contextWindow === null ? "-" : `${Math.round(model.contextWindow / 1000)}K`;
    const price =
      model.category === "image"
        ? model.pricing.imagePerGeneration === null
          ? "-"
          : `$${formatPrice(model.pricing.imagePerGeneration)}/image`
        : model.category === "video"
          ? model.pricing.videoPerSecond["720p"] === null
            ? "-"
            : `$${formatPrice(model.pricing.videoPerSecond["720p"])}/sec`
          : `${model.pricing.inputPer1M === null ? "-" : `$${formatPrice(model.pricing.inputPer1M)}`} / ${
              model.pricing.outputPer1M === null ? "-" : `$${formatPrice(model.pricing.outputPer1M)}`
            }`;
    return `| \`${model.id}\` | ${model.vendor} | ${model.category} | ${context} | ${model.capabilities.join(", ") || "-"} | ${price} |`;
  };

  return [
    `# NormaHub catalog — ${catalog.models.length} models`,
    "",
    `Source: ${catalog.source}; fetched ${catalog.fetchedAt}` +
      (catalog.updatedAt ? `; upstream updated ${catalog.updatedAt}` : ""),
    catalog.warning ? `\n> ${catalog.warning}` : "",
    "",
    "| Model | Vendor | Kind | Context | Capabilities | Price (USD) |",
    "|---|---|---|---|---|---|",
    ...catalog.models.map(line),
    "",
    "Text prices are per 1M tokens (input / output). Media prices are per image or per video second.",
    "Cards and examples: https://normahub.cc/models",
  ].join("\n");
}

export async function handleReadResource(
  uri: string
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  if (uri === "normahub://models") {
    const catalog = await loadCatalog();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              total_models: catalog.models.length,
              source: catalog.source,
              fetched_at: catalog.fetchedAt,
              upstream_updated_at: catalog.updatedAt ?? null,
              warning: catalog.warning ?? null,
              gateway: "https://api.normahub.cc/v1",
              models: catalog.models,
              markdown_summary: markdownTable(catalog),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (uri === "normahub://status") {
    const catalog = await loadCatalog();
    const status = await apiClient.getGatewayStatus(catalog.models.length);

    const markdown = [
      "# NormaHub gateway status",
      "",
      `- Reachability: ${status.status}`,
      `- Models call latency: ${status.pingMs} ms`,
      `- Base URL: ${status.baseUrl}`,
      `- Models in catalog: ${status.activeModelsCount} (${catalog.source})`,
      `- Checked at: ${status.timestamp}`,
      "",
      "## Endpoints",
      `- Chat: \`${status.endpoints.chat}\``,
      `- Responses: \`${status.endpoints.responses}\``,
      `- Messages: \`${status.endpoints.messages}\``,
      `- Images: \`${status.endpoints.images}\``,
      `- Videos: \`${status.endpoints.videos}\``,
      `- Video status: \`${status.endpoints.videoStatus}\``,
      `- Models: \`${status.endpoints.models}\``,
    ].join("\n");

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ ...status, markdown_summary: markdown }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}. Available: normahub://models, normahub://status.`);
}