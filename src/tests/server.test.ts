import test from "node:test";
import assert from "node:assert/strict";
import { createNormaHubServer } from "../server.js";
import { NORMAHUB_MODELS } from "../data/models.js";
import { PROMPT_DEFINITIONS, handleGetPrompt } from "../prompts/index.js";
import { RESOURCE_DEFINITIONS, handleReadResource } from "../resources/index.js";
import {
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

test("NormaHub MCP Server instantiates correctly", () => {
  const server = createNormaHubServer();
  assert.ok(server);
});

test("Model catalog contains expected models and pricing", () => {
  assert.ok(NORMAHUB_MODELS.length >= 25);
  const deepseek = NORMAHUB_MODELS.find((m) => m.id.includes("deepseek"));
  assert.ok(deepseek);
  assert.equal(deepseek.family, "DeepSeek");

  const seedance = NORMAHUB_MODELS.find((m) => m.id.includes("seedance"));
  assert.ok(seedance);
});

test("Prompt templates render correctly", async () => {
  assert.equal(PROMPT_DEFINITIONS.length, 3);
  
  const codePrompt = await handleGetPrompt("review_code", {
    code: "def add(a, b): return a + b",
    focus: "performance",
  });
  assert.ok(codePrompt.messages.length > 0);
  assert.match(codePrompt.messages[0].content.text, /def add/);

  const videoPrompt = await handleGetPrompt("direct_video_scene", {
    concept: "cyberpunk drone race",
    style: "cinematic",
  });
  assert.match(videoPrompt.messages[0].content.text, /cyberpunk drone race/);
});

test("Resource handlers return valid JSON content", async () => {
  assert.equal(RESOURCE_DEFINITIONS.length, 2);

  const modelsResource = await handleReadResource("normahub://models");
  assert.equal(modelsResource.contents.length, 1);
  const parsed = JSON.parse(modelsResource.contents[0].text);
  assert.ok(Array.isArray(parsed.models));
  assert.ok(parsed.models.length >= 25);

  const statusResource = await handleReadResource("normahub://status");
  const parsedStatus = JSON.parse(statusResource.contents[0].text);
  assert.ok(parsedStatus.status);
});
