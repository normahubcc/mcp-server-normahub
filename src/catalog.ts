/**
 * Live model catalog.
 *
 * The repository used to ship a hand-written list of "30 models" with prices
 * fixed at build time. The public API now reports 34, drops models that the
 * bundled list still advertises (SeeDance), and changes prices — so the tool
 * description "with pricing", the resources and the cost advice were all
 * describing a catalog that no longer existed.
 *
 * Order of truth: live public endpoint -> in-memory cache -> bundled snapshot.
 * The bundled snapshot is only an offline fallback, never a claim about today.
 */

import { NORMAHUB_MODELS } from "./data/models.js";
import type { NormaHubModelMeta } from "./types.js";

export const PUBLIC_CATALOG_URL =
  process.env.NORMAHUB_CATALOG_URL?.trim() || "https://api.normahub.cc/api/v1/public/models";

const CATALOG_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const FETCH_ATTEMPTS = 2;

export type ModelCategory = "llm" | "image" | "video" | "audio";
export type CatalogSource = "live" | "bundled";

export interface VideoPrice {
  "480p": number | null;
  "720p": number | null;
  "1080p": number | null;
  "4k": number | null;
}

export interface ModelPricing {
  currency: string;
  inputPer1M: number | null;
  outputPer1M: number | null;
  cachedInputPer1M: number | null;
  cachedOutputPer1M: number | null;
  imagePerGeneration: number | null;
  videoPerSecond: VideoPrice;
  cachePercent: number | null;
}

export interface CatalogModel {
  id: string;
  name: string;
  vendor: string;
  category: ModelCategory;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  capabilities: string[];
  endpoints: string[];
  pricing: ModelPricing;
  summary?: string;
  updatedAt?: string;
}

export interface Catalog {
  models: CatalogModel[];
  source: CatalogSource;
  fetchedAt: string;
  /** Upstream `updated_at`, when the live payload provided it. */
  updatedAt?: string;
  /** Present when the live fetch failed and a fallback was used. */
  warning?: string;
}

type Json = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Bundled prices look like "$0.3500", context like "1,000,000 tokens", media like "Fixed per video". */
function parseBundledPrice(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function categoryOf(endpoints: string[], id: string): ModelCategory {
  if (endpoints.some((e) => e.includes("/images/"))) return "image";
  if (endpoints.some((e) => e.includes("/videos"))) return "video";
  if (endpoints.some((e) => e.includes("/audio/"))) return "audio";
  if (/image/.test(id)) return "image";
  if (/video/.test(id)) return "video";
  if (/whisper|tts|audio/.test(id)) return "audio";
  return "llm";
}

function capabilitiesOf(caps: Json | undefined): string[] {
  if (!caps) return [];
  return Object.entries(caps)
    .filter(([, enabled]) => enabled === true)
    .map(([name]) => name)
    .sort();
}

function normalizeLiveModel(raw: Json): CatalogModel | null {
  const id = str(raw.id);
  if (!id) return null;
  const pricing = (raw.pricing ?? {}) as Json;
  const page = (raw.public_page ?? {}) as Json;
  const endpoints = Array.isArray(raw.endpoints)
    ? raw.endpoints.filter((e): e is string => typeof e === "string")
    : [];

  return {
    id,
    name: str(page.name) ?? str(raw.display_name) ?? id,
    vendor: str(raw.provider_display_name) ?? str(raw.owned_by) ?? "unknown",
    category: categoryOf(endpoints, id),
    contextWindow: num(raw.context_window),
    maxOutputTokens: num(raw.max_output_tokens),
    capabilities: capabilitiesOf(raw.capabilities as Json | undefined),
    endpoints,
    pricing: {
      currency: str(pricing.currency) ?? "USD",
      inputPer1M: num(pricing.input_price_per_million),
      outputPer1M: num(pricing.output_price_per_million),
      cachedInputPer1M: num(pricing.input_price_per_million_cached),
      cachedOutputPer1M: num(pricing.output_price_per_million_cached),
      imagePerGeneration: num(pricing.image_price),
      videoPerSecond: {
        "480p": num(pricing.video_price_480p_per_sec),
        "720p": num(pricing.video_price_720p_per_sec),
        "1080p": num(pricing.video_price_1080p_per_sec),
        "4k": num(pricing.video_price_4k_per_sec),
      },
      cachePercent: num(pricing.cache_percent),
  },
    summary: str(page.summary),
    updatedAt: str(page.updated_at),
  };
}

function fromBundled(meta: NormaHubModelMeta): CatalogModel {
  return {
    id: meta.id,
    name: meta.name,
    vendor: meta.family,
    category: meta.category,
    contextWindow: parseBundledPrice(meta.context),
    maxOutputTokens: null,
    capabilities: meta.capabilities.map((c) => c.toLowerCase()),
    endpoints: [],
    pricing: {
      currency: "USD",
      inputPer1M: parseBundledPrice(meta.pricing.inputPer1M),
      outputPer1M: parseBundledPrice(meta.pricing.outputPer1M),
      cachedInputPer1M: null,
      cachedOutputPer1M: null,
      imagePerGeneration: null,
      videoPerSecond: { "480p": null, "720p": null, "1080p": null, "4k": null },
      cachePercent: null,
    },
    summary: meta.description,
  };
}

export function bundledCatalog(): CatalogModel[] {
  return NORMAHUB_MODELS.map(fromBundled);
}

let cache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

export function isOffline(): boolean {
  const flag = (process.env.NORMAHUB_OFFLINE ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

async function fetchLive(fetchImpl: typeof fetch): Promise<Catalog> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(PUBLIC_CATALOG_URL, {
        headers: { Accept: "application/json", "User-Agent": "NormaHub-MCP-Server" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      const payload = (await response.json()) as Json;
      const rawModels = Array.isArray(payload.models) ? (payload.models as Json[]) : [];
      const models = rawModels
        .map(normalizeLiveModel)
        .filter((m): m is CatalogModel => m !== null);
      if (models.length === 0) {
        throw new Error("catalog payload contained no models");
      }
      return {
        models,
        source: "live",
        fetchedAt: new Date().toISOString(),
        updatedAt: str(payload.updated_at),
      };
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface LoadCatalogOptions {
  force?: boolean;
  fetchImpl?: typeof fetch;
  /** Ignore the cache entirely; used by tests and by `force`. */
  ttlMs?: number;
}

export async function loadCatalog(options: LoadCatalogOptions = {}): Promise<Catalog> {
  const ttl = options.ttlMs ?? CATALOG_TTL_MS;
  if (!options.force && cache && Date.now() - Date.parse(cache.fetchedAt) < ttl) {
    return cache;
  }
  if (inflight) return inflight;

  const fallback = (warning: string): Catalog => ({
    models: bundledCatalog(),
    source: "bundled",
    fetchedAt: new Date().toISOString(),
    warning,
  });

  if (isOffline()) {
    cache = fallback("NORMAHUB_OFFLINE is set — using the bundled snapshot.");
    return cache;
  }

  inflight = (async () => {
    try {
      cache = await fetchLive(options.fetchImpl ?? fetch);
      return cache;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Keep serving the last good catalog rather than downgrading to a stale snapshot.
      if (cache && cache.source === "live") {
        return { ...cache, warning: `Live catalog refresh failed (${message}); using cached copy.` };
      }
      cache = fallback(`Live catalog unavailable (${message}); using bundled snapshot.`);
      return cache;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Test helper: drops the in-memory catalog. */
export function resetCatalogCache(): void {
  cache = null;
  inflight = null;
}

export function findModel(catalog: Catalog, id: string): CatalogModel | undefined {
  return (
    catalog.models.find((m) => m.id === id) ??
    catalog.models.find((m) => m.id.toLowerCase() === id.toLowerCase())
  );
}

/** Cheap "did you mean" — token overlap plus prefix, good enough for model ids. */
export function suggestModelIds(catalog: Catalog, id: string, limit = 5): string[] {
  const needle = id.toLowerCase();
  const tokens = needle.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const scored = catalog.models
    .map((model) => {
      const haystack = model.id.toLowerCase();
      let score = 0;
      if (haystack.startsWith(needle.slice(0, 3))) score += 2;
      for (const token of tokens) if (haystack.includes(token)) score += 3;
      if (haystack.includes(needle)) score += 4;
      return { id: model.id, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.id);
}

export function modelsOfCategory(catalog: Catalog, category: ModelCategory): CatalogModel[] {
  return catalog.models.filter((model) => model.category === category);
}

/** Resolves a model id for a tool call, or throws a message that lists alternatives. */
export function requireModel(
  catalog: Catalog,
  requested: string,
  expected: ModelCategory | readonly ModelCategory[]
): CatalogModel {
  const categories = Array.isArray(expected) ? expected : [expected];
  const model = findModel(catalog, requested);
  if (!model) {
    const suggestions = suggestModelIds(catalog, requested);
    const hint = suggestions.length
      ? ` Did you mean: ${suggestions.join(", ")}?`
      : ` Call normahub_list_models to see the current catalog.`;
    throw new Error(`Unknown model "${requested}".${hint}`);
  }
  if (!categories.includes(model.category)) {
    throw new Error(
      `Model "${model.id}" is a ${model.category} model and cannot be used here (expected: ${categories.join(
        " or "
      )}).`
    );
  }
  return model;
}

/** Up to four decimals, trailing zeros trimmed — one style for every price column. */
export function formatPrice(value: number | null): string {
  if (value === null) return "n/a";
  if (value === 0) return "0";
  return value.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}