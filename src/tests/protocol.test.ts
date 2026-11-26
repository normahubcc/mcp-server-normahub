import test, { before, after } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createNormaHubServer, SERVER_INFO } from "../server.js";
import { loadCatalog, resetCatalogCache } from "../catalog.js";
import { VERSION } from "../version.js";
import { fixtureFetch } from "./fixture.js";

let client: Client;
let server: ReturnType<typeof createNormaHubServer>;

before(async () => {
  resetCatalogCache();
  await loadCatalog({ force: true, fetchImpl: fixtureFetch() });

  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  server = createNormaHubServer();
  await server.connect(serverSide);

  client = new Client({ name: "normahub-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(clientSide);
});

after(async () => {
  await client.close().catch(() => {});
  await server.close().catch(() => {});
});

test("handshake reports the package version and helpful instructions", () => {
  assert.equal(client.getServerVersion()?.name, "io.github.normahubcc/mcp-server-normahub");
  assert.equal(client.getServerVersion()?.version, VERSION);
  const instructions = client.getInstructions() ?? "";
  assert.match(instructions, /normahub_list_models/);
  assert.match(instructions, /estimate_cost/);
  assert.deepEqual(
    Object.keys(client.getServerCapabilities() ?? {}).sort(),
    ["prompts", "resources", "tools"]
  );
});

test("all eight tools have a usable schema and description", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      "normahub_estimate_cost",
      "normahub_generate_image",
      "normahub_generate_video",
      "normahub_get_balance",
      "normahub_image_to_video",
      "normahub_list_models",
      "normahub_prompt_model",
      "normahub_transcribe_audio",
    ]
  );
  assert.equal(tools.length, SERVER_INFO.tools);

  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a real description`);
    assert.equal(tool.inputSchema.type, "object", `${tool.name} schema must be an object`);
  }
  const video = tools.find((tool) => tool.name === "normahub_generate_video");
  assert.match(String(video?.description), /estimated cost/);
});

test("list_models over the protocol returns the live catalog", async () => {
  const result = await client.callTool({ name: "normahub_list_models", arguments: {} });
  const text = (result.content as Array<{ type: string; text?: string }>)
    .map((item) => item.text ?? "")
    .join("\n");
  assert.match(text, /3 of 3 models \(source: live\)/);
  assert.equal(result.isError, undefined);
});

test("unknown tool and bad arguments come back as tool errors, not crashes", async () => {
  const unknown = await client.callTool({ name: "normahub_do_magic", arguments: {} });
  assert.equal(unknown.isError, true);
  assert.match(String((unknown.content as Array<{ text?: string }>)[0]?.text), /Unknown tool "normahub_do_magic"/);

  const badArgs = await client.callTool({ name: "normahub_estimate_cost", arguments: { model: "nope" } });
  assert.equal(badArgs.isError, true);
  assert.match(String((badArgs.content as Array<{ text?: string }>)[0]?.text), /Unknown model "nope"/);
});

test("resources expose the catalog and the gateway status", async () => {
  const { resources } = await client.listResources();
  assert.deepEqual(
    resources.map((resource) => resource.uri),
    ["normahub://models", "normahub://status"]
  );

  const models = await client.readResource({ uri: "normahub://models" });
  const payload = JSON.parse(String((models.contents[0] as { text?: string }).text));
  assert.equal(payload.total_models, 3);
  assert.equal(payload.source, "live");
  assert.match(payload.markdown_summary, /# NormaHub catalog — 3 models/);

  await assert.rejects(() => client.readResource({ uri: "normahub://nope" }), /Unknown resource URI/);
});

test("prompt templates still render after the refactor", async () => {
  const { prompts } = await client.listPrompts();
  assert.equal(prompts.length, 3);

  const review = await client.getPrompt({
    name: "review_code",
    arguments: { code: "def add(a, b): return a + b", focus: "security" },
  });
  const rendered = String(
    (review.messages[0]?.content as { text?: string } | undefined)?.text ?? ""
  );
  assert.match(rendered, /def add/);
  assert.match(rendered, /security/i);
});