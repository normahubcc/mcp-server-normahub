import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bundledCatalog,
  findModel,
  loadCatalog,
  modelsOfCategory,
  requireModel,
  resetCatalogCache,
  suggestModelIds,
} from "../catalog.js";
import { NORMAHUB_MODELS } from "../data/models.js";
import { VERSION } from "../version.js";
import { fixtureFetch, failingFetch } from "./fixture.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, "server.json"), "utf-8"));

test("version comes from package.json and matches the registry manifest", () => {
  assert.equal(VERSION, pkg.version);
  assert.equal(registry.version, pkg.version);
  assert.equal(registry.name, pkg.mcpName);
  assert.equal(registry.packages[0].identifier, pkg.name);
  assert.equal(registry.packages[0].version, pkg.version);
  assert.ok(registry.description.length <= 100, "registry rejects descriptions over 100 chars");
});

test("live payload is normalized into the internal model shape", async () => {
  resetCatalogCache();
  const catalog = await loadCatalog({ force: true, fetchImpl: fixtureFetch() });

  assert.equal(catalog.source, "live");
  assert.equal(catalog.models.length, 3);
  assert.equal(catalog.updatedAt, "2026-11-21T14:46:57.000000+00:00");

  const sonnet = findModel(catalog, "claude-sonnet-5-5");
  assert.ok(sonnet);
  assert.equal(sonnet.name, "Claude Sonnet 5.5", "public_page.name wins over a null display_name");
  assert.equal(sonnet.vendor, "Anthropic");
  assert.equal(sonnet.category, "llm");
  assert.equal(sonnet.contextWindow, 1_000_000);
  assert.equal(sonnet.pricing.inputPer1M, 0.35);
  assert.equal(sonnet.pricing.cachedInputPer1M, 0.3);
  assert.deepEqual(sonnet.capabilities, ["anthropic", "openai", "reasoning", "streaming", "tools"]);

  assert.equal(findModel(catalog, "gpt-image-2.5-flare")?.category, "image");
  assert.equal(findModel(catalog, "grok-imagine-video-1.5")?.category, "video");
  assert.equal(findModel(catalog, "grok-imagine-video-1.5")?.pricing.videoPerSecond["720p"], 0.2);
});

test("fresh catalog is served from memory without another request", async () => {
  resetCatalogCache();
  const calls = { count: 0 };
  const first = await loadCatalog({ force: true, fetchImpl: fixtureFetch(calls) });
  const second = await loadCatalog({ fetchImpl: failingFetch("must not be called") });
  assert.equal(calls.count, 1);
  assert.equal(second.source, "live");
  assert.equal(second.models.length, first.models.length);
});

test("failed refresh keeps the last good live catalog instead of downgrading", async () => {
  resetCatalogCache();
  await loadCatalog({ force: true, fetchImpl: fixtureFetch() });
  const stale = await loadCatalog({ force: true, fetchImpl: failingFetch() });
  assert.equal(stale.source, "live");
  assert.match(stale.warning ?? "", /refresh failed/i);
  assert.equal(stale.models.length, 3);
});

test("no live catalog at all falls back to the bundled snapshot with a warning", async () => {
  resetCatalogCache();
  const catalog = await loadCatalog({ force: true, fetchImpl: failingFetch() });
  assert.equal(catalog.source, "bundled");
  assert.ok(catalog.warning);
  assert.equal(catalog.models.length, NORMAHUB_MODELS.length);
  assert.equal(bundledCatalog().every((m) => m.id.length > 0), true);
});

test("bundled prices are parsed, not compared as strings", () => {
  const claude = bundledCatalog().find((m) => m.id === "claude-sonnet-5-5");
  assert.ok(claude);
  assert.equal(claude.pricing.inputPer1M, 0.35);
  assert.equal(claude.pricing.outputPer1M, 1.8);
});

test("requireModel explains a wrong modality and suggests close ids", async () => {
  resetCatalogCache();
  const catalog = await loadCatalog({ force: true, fetchImpl: fixtureFetch() });

  assert.throws(
    () => requireModel(catalog, "gpt-image-2.5-flare", "llm"),
    /is a image model and cannot be used here/
  );
  assert.throws(() => requireModel(catalog, "claude-sonet-5-5", "llm"), /Did you mean: claude-sonnet-5-5/);
  assert.deepEqual(
    modelsOfCategory(catalog, "video").map((m) => m.id),
    ["grok-imagine-video-1.5"]
  );
  assert.ok(suggestModelIds(catalog, "grok video").includes("grok-imagine-video-1.5"));
});

test("case-insensitive lookup does not silently accept a different model", async () => {
  resetCatalogCache();
  const catalog = await loadCatalog({ force: true, fetchImpl: fixtureFetch() });
  assert.equal(findModel(catalog, "CLAUDE-SONNET-5-5")?.id, "claude-sonnet-5-5");
  assert.equal(findModel(catalog, "claude-sonnet"), undefined);
});