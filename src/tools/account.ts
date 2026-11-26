/**
 * MCP tools: model catalog and cost estimation.
 *
 * Both read the live catalog. The old `normahub_list_models` claimed to list
 * "models and their pricing" but printed ids only, and fell back to the string
 * "30 active models" when the API failed — a fake answer with a made-up number.
 */

import { apiClient } from "../client.js";
import {
  formatPrice,
  loadCatalog,
  modelsOfCategory,
  requireModel,
  type Catalog,
  type CatalogModel,
  type ModelCategory,
} from "../catalog.js";
import { ToolInputError } from "../errors.js";
import { optionalEnum, optionalNumber, optionalString, requiredString } from "../args.js";

const CATEGORIES = ["llm", "image", "video", "audio"] as const;

export const ACCOUNT_TOOL_DEFINITION = {
  name: "normahub_list_models",
  description:
    "List the models currently available on NormaHub with context window and live prices per 1M tokens. " +
    "Filter by category or search by name. Use this before choosing a model id for other tools.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: [...CATEGORIES],
        description: "Filter by modality: llm (text/code), image, video, audio.",
      },
      query: {
        type: "string",
        description: "Case-insensitive substring match on model id, name or vendor (e.g. 'claude', 'deepseek', 'image').",
      },
      limit: {
        type: "number",
        description: "Maximum number of rows to return (default 50, max 200).",
      },
    },
  },
};

function priceColumn(model: CatalogModel): string {
  const { pricing } = model;
  if (model.category === "image") {
    return pricing.imagePerGeneration === null
      ? "n/a"
      : `$${formatPrice(pricing.imagePerGeneration)}/image`;
  }
  if (model.category === "video") {
    const perSecond = pricing.videoPerSecond["720p"] ?? pricing.videoPerSecond["480p"];
    return perSecond === null ? "n/a" : `$${formatPrice(perSecond)}/sec`;
  }
  const input = pricing.inputPer1M === null ? "n/a" : `$${formatPrice(pricing.inputPer1M)}`;
  const output = pricing.outputPer1M === null ? "n/a" : `$${formatPrice(pricing.outputPer1M)}`;
  return `${input}/${output} per 1M`;
}

function renderModels(catalog: Catalog, models: CatalogModel[], total: number): string {
  const header = `NormaHub catalog — ${models.length} of ${total} models (source: ${catalog.source})`;
  const freshness = catalog.updatedAt
    ? `Catalog updated upstream: ${catalog.updatedAt}`
    : `Fetched: ${catalog.fetchedAt}`;
  const warning = catalog.warning ? `\nWARNING: ${catalog.warning}` : "";
  if (models.length === 0) {
    return `${header}\n${freshness}${warning}\n\nNo models matched the filter.`;
  }

  const rows = models.map((model) => {
    const context = model.contextWindow === null ? "-" : `${Math.round(model.contextWindow / 1000)}K`;
    const caps = model.capabilities.length ? model.capabilities.join(",") : "-";
    return `${model.id.padEnd(28)} ${model.vendor.padEnd(12)} ${model.category.padEnd(6)} ${context.padStart(6)}  ${priceColumn(model).padEnd(22)} ${caps}`;
  });

  return [
    header,
    freshness,
    warning,
    "",
    `${"id".padEnd(28)} ${"vendor".padEnd(12)} ${"kind".padEnd(6)} ${"ctx".padStart(6)}  ${"price".padEnd(22)} capabilities`,
    "-".repeat(112),
    ...rows,
    "",
    "Prices are USD list prices per million tokens (text) or per generation/second (media).",
    "Cards and descriptions: https://normahub.cc/models",
  ].join("\n");
}

export async function handleAccountTool(args: unknown): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const category = optionalEnum(args, "category", CATEGORIES);
  const query = optionalString(args, "query")?.toLowerCase();
  const limit = optionalNumber(args, "limit", { min: 1, max: 200 }) ?? 50;

  const catalog = await loadCatalog();
  let models = category ? modelsOfCategory(catalog, category as ModelCategory) : catalog.models;
  if (query) {
    models = models.filter((model) =>
      `${model.id} ${model.name} ${model.vendor}`.toLowerCase().includes(query)
    );
  }
  models = [...models]
    .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.id.localeCompare(b.id))
    .slice(0, limit);

  return { content: [{ type: "text", text: renderModels(catalog, models, catalog.models.length) }] };
}

export const BALANCE_TOOL_DEFINITION = {
  name: "normahub_get_balance",
  description:
    "Check the NormaHub account balance in Russian rubles, active plan and payment methods. " +
    "Requires NORMAHUB_API_KEY; authentication failures are reported as errors, not as a positive balance.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export async function handleBalanceTool(_args: unknown): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const balance = await apiClient.getBalance();

  if (balance === null) {
    return {
      content: [
        {
          type: "text",
          text:
            "The gateway does not expose /v1/balance for this account.\n" +
            "Check the actual balance and invoices at https://normahub.cc/dashboard (СБП, МИР, corporate invoice).\n" +
            "Do not assume a positive balance from this answer.",
        },
      ],
    };
  }

  const amount = balance.balance;
  const currency = typeof balance.currency === "string" ? balance.currency : "RUB";
  const rendered =
    typeof amount === "number" || (typeof amount === "string" && amount.trim() !== "")
      ? `${Number(amount).toFixed(2)} ${currency}`
      : null;

  const lines = [
    rendered ? `Balance: ${rendered}` : "Balance: not reported by the gateway.",
    typeof balance.plan === "string" ? `Plan: ${balance.plan}` : null,
    typeof balance.status === "string" ? `Status: ${balance.status}` : null,
    "",
    "Top-up and invoices: https://normahub.cc/dashboard",
  ].filter((line): line is string => line !== null);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export const ESTIMATE_COST_TOOL_DEFINITION = {
  name: "normahub_estimate_cost",
  description:
    "Estimate the USD list cost of a task before spending money: text (tokens in/out, optional cached input), " +
    "image (generations) or video (seconds at a resolution). Uses live catalog prices.",
  inputSchema: {
    type: "object",
    properties: {
      model: { type: "string", description: "Model id from normahub_list_models." },
      requests: {
        type: "number",
        description: "How many identical requests to estimate (default 1).",
        default: 1,
      },
      input_tokens: { type: "number", description: "Input tokens per request (text models)." },
      output_tokens: { type: "number", description: "Output tokens per request (text models)." },
      cached_input_tokens: {
        type: "number",
        description: "Portion of input_tokens served from prompt cache, if the model supports caching.",
      },
      image_count: { type: "number", description: "Number of images (image models)." },
      video_seconds: { type: "number", description: "Video length in seconds per clip (video models)." },
      resolution: {
        type: "string",
        enum: ["480p", "720p", "1080p", "4k"],
        description: "Video resolution tier, default 720p.",
      },
    },
    required: ["model"],
  },
};

export async function handleEstimateCostTool(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const requested = requiredString(args, "model");
  const catalog = await loadCatalog();
  const model = requireModel(catalog, requested, CATEGORIES);
  const requests = optionalNumber(args, "requests", { min: 1, max: 1_000_000 }) ?? 1;

  const hasTokenArgs = ["input_tokens", "output_tokens", "cached_input_tokens"].some(
    (key) => (args as Record<string, unknown> | null)?.[key] !== undefined
  );
  const hasImageArgs = (args as Record<string, unknown> | null)?.image_count !== undefined;
  const hasVideoArgs = ["video_seconds", "resolution"].some(
    (key) => (args as Record<string, unknown> | null)?.[key] !== undefined
  );
  const wrongArgs =
    (model.category !== "llm" && hasTokenArgs) ||
    (model.category !== "image" && hasImageArgs) ||
    (model.category !== "video" && hasVideoArgs);
  if (wrongArgs) {
    throw new ToolInputError(
      `"${model.id}" is a ${model.category} model: use ` +
        (model.category === "llm"
          ? "input_tokens / output_tokens."
          : model.category === "image"
            ? "image_count."
            : "video_seconds and resolution.") +
        " Mixing billing dimensions produces a wrong estimate."
    );
  }

  const lines: string[] = [`Model: ${model.id} (${model.vendor}, ${model.category})`];
  let totalUsd = 0;
  let basis = "";

  if (model.category === "llm") {
    const inputTokens = optionalNumber(args, "input_tokens", { min: 0 });
    const outputTokens = optionalNumber(args, "output_tokens", { min: 0 });
    if (inputTokens === undefined && outputTokens === undefined) {
      throw new ToolInputError(
        "For a text model provide input_tokens and/or output_tokens (per request)."
      );
    }
    const cached = optionalNumber(args, "cached_input_tokens", { min: 0 }) ?? 0;
    if (cached > (inputTokens ?? 0)) {
      throw new ToolInputError("cached_input_tokens cannot exceed input_tokens.");
    }

    const inRate = model.pricing.inputPer1M;
    const outRate = model.pricing.outputPer1M;
    const cachedRate = model.pricing.cachedInputPer1M ?? inRate;
    if (inRate === null || outRate === null) {
      throw new ToolInputError(
        `The catalog publishes no per-token price for "${model.id}". Check https://normahub.cc/models.`
      );
    }

    const billableInput = (inputTokens ?? 0) - cached;
    const perRequest =
      (billableInput * inRate + cached * (cachedRate ?? inRate) + (outputTokens ?? 0) * outRate) /
      1_000_000;
    totalUsd = perRequest * requests;
    basis =
      `input ${inputTokens ?? 0} tok` +
      (cached ? ` (${cached} cached @ $${formatPrice(cachedRate)}/1M)` : "") +
      `, output ${outputTokens ?? 0} tok, × ${requests} request(s)`;
  } else if (model.category === "image") {
    const count = optionalNumber(args, "image_count", { min: 1, max: 100_000 }) ?? 1;
    const rate = model.pricing.imagePerGeneration;
    if (rate === null) {
      throw new ToolInputError(`The catalog publishes no image price for "${model.id}".`);
    }
    totalUsd = rate * count;
    basis = `${count} image(s) @ $${formatPrice(rate)} each`;
  } else if (model.category === "video") {
    const seconds = optionalNumber(args, "video_seconds", { min: 1, max: 3600 });
    if (seconds === undefined) {
      throw new ToolInputError("For a video model provide video_seconds (length of one clip).");
    }
    const resolution = optionalEnum(args, "resolution", ["480p", "720p", "1080p", "4k"] as const) ?? "720p";
    const rate =
      model.pricing.videoPerSecond[resolution] ??
      model.pricing.videoPerSecond["720p"] ??
      model.pricing.videoPerSecond["480p"];
    if (rate === null) {
      throw new ToolInputError(`The catalog publishes no ${resolution} video price for "${model.id}".`);
    }
    totalUsd = rate * seconds * requests;
    basis = `${seconds}s at ${resolution} @ $${formatPrice(rate)}/sec, × ${requests} clip(s)`;
  } else {
    throw new ToolInputError(`Cost estimation is not supported for ${model.category} models.`);
  }

  lines.push(`Basis: ${basis}`);
  lines.push(`Estimated cost: $${totalUsd.toFixed(4)} USD (list price)`);
  if (model.pricing.cachePercent !== null && model.category === "llm") {
    lines.push(`Prompt cache discount published by the gateway: ${model.pricing.cachePercent}%`);
  }
  lines.push(
    "Actual charge is made in RUB at the gateway's current rate; check the invoice in https://normahub.cc/dashboard."
  );
  if (catalog.source === "bundled") {
    lines.push(`WARNING: prices come from the bundled snapshot, not the live catalog. ${catalog.warning ?? ""}`.trim());
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** Used by tools that need a default when the caller omitted the model. */
export function firstModelOfCategory(
  catalog: Catalog,
  category: ModelCategory
): CatalogModel | undefined {
  return modelsOfCategory(catalog, category)[0];
}