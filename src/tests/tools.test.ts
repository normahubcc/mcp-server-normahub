import test, { before, after } from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../config.js";
import { loadCatalog, resetCatalogCache } from "../catalog.js";
import { NormaHubApiError } from "../errors.js";
import { handleAccountTool, handleBalanceTool, handleEstimateCostTool } from "../tools/account.js";
import { handleChatTool } from "../tools/chat.js";
import { handleImageTool } from "../tools/image.js";
import { handleVideoTool, defaultVideoModelId } from "../tools/video.js";
import { handleAudioTool } from "../tools/audio.js";
import { mimeTypeFor } from "../client.js";
import { fixtureFetch } from "./fixture.js";

const originalFetch = globalThis.fetch;

before(async () => {
  resetCatalogCache();
  await loadCatalog({ force: true, fetchImpl: fixtureFetch() });
  CONFIG.apiKey = "test-key";
});

after(() => {
  globalThis.fetch = originalFetch;
  CONFIG.apiKey = "";
});

function textOf(result: { content: Array<Record<string, unknown>> }): string {
  return result.content
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}

test("list_models renders live prices and the real model count", async () => {
  const result = await handleAccountTool({});
  const text = textOf(result);
  assert.match(text, /3 of 3 models \(source: live\)/);
  assert.match(text, /claude-sonnet-5-5\s+Anthropic\s+llm/);
  assert.match(text, /\$0\.35\/\$1\.8 per 1M/);
  assert.match(text, /\$0\.04\/image/);
  assert.match(text, /\$0\.2\/sec/);
  assert.doesNotMatch(text, /30 active models/);
});

test("list_models filters by category and query", async () => {
  const videos = textOf(await handleAccountTool({ category: "video" }));
  assert.match(videos, /grok-imagine-video-1\.5/);
  assert.doesNotMatch(videos, /claude-sonnet/);

  const search = textOf(await handleAccountTool({ query: "image" }));
  assert.match(search, /gpt-image-2\.5-flare/);
  assert.doesNotMatch(search, /grok-imagine-video/);

  await assert.rejects(() => handleAccountTool({ category: "audio-magic" }), /must be one of/);
});

test("estimate_cost does token, cache, image and video arithmetic", async () => {
  const tokens = textOf(
    await handleEstimateCostTool({
      model: "claude-sonnet-5-5",
      input_tokens: 1_000_000,
      output_tokens: 0,
    })
  );
  assert.match(tokens, /Estimated cost: \$0\.3500 USD/);

  const cached = textOf(
    await handleEstimateCostTool({
      model: "claude-sonnet-5-5",
      input_tokens: 1_000_000,
      cached_input_tokens: 500_000,
      output_tokens: 0,
    })
  );
  assert.match(cached, /500000 cached @ \$0\.3\/1M/);
  assert.match(cached, /Estimated cost: \$0\.3250 USD/);

  const images = textOf(await handleEstimateCostTool({ model: "gpt-image-2.5-flare", image_count: 3 }));
  assert.match(images, /Estimated cost: \$0\.1200 USD/);

  const video = textOf(
    await handleEstimateCostTool({
      model: "grok-imagine-video-1.5",
      video_seconds: 5,
      resolution: "720p",
    })
  );
  assert.match(video, /720p @ \$0\.2\/sec/);
  assert.match(video, /Estimated cost: \$1\.0000 USD/);
});

test("estimate_cost refuses wrong modality and missing numbers", async () => {
  await assert.rejects(
    () => handleEstimateCostTool({ model: "gpt-image-2.5-flare", input_tokens: 1000 }),
    /is a image model/
  );
  await assert.rejects(() => handleEstimateCostTool({ model: "claude-sonnet-5-5" }), /input_tokens/);
  await assert.rejects(
    () =>
      handleEstimateCostTool({
        model: "claude-sonnet-5-5",
        input_tokens: 100,
        cached_input_tokens: 200,
      }),
    /cannot exceed/
  );
  await assert.rejects(() => handleEstimateCostTool({ model: "nope-1" }), /Unknown model "nope-1"/);
});

test("chat tool returns the answer with usage and estimated cost", async () => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    assert.match(url, /\/chat\/completions$/);
    return new Response(
      JSON.stringify({
        id: "cmpl-1",
        model: "claude-sonnet-5-5",
        choices: [{ message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const text = textOf(await handleChatTool({ model: "claude-sonnet-5-5", prompt: "ping" }));
  assert.match(text, /tokens: 1000000 in \/ 0 out/);
  assert.match(text, /estimated cost: \$0\.350000/);
  assert.match(text, /pong$/);
});

test("chat tool validates arguments before spending a call", async () => {
  await assert.rejects(() => handleChatTool({ model: "claude-sonnet-5-5" }), /prompt.*messages/);
  await assert.rejects(
    () => handleChatTool({ model: "claude-sonnet-5-5", prompt: "x", temperature: 9 }),
    /temperature/
  );
  await assert.rejects(
    () =>
      handleChatTool({
        model: "claude-sonnet-5-5",
        messages: [{ role: "wizard", content: "hi" }],
      }),
    /role/
  );
});

test("image tool returns the URL and the price of the batch", async () => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/images\/generations$/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-image-2.5-flare");
    assert.equal(body.size, "1024x1024");
    return new Response(JSON.stringify({ created: 1, data: [{ url: "https://cdn.normahub.cc/x.png" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const text = textOf(await handleImageTool({ prompt: "a red cube", n: 2 }));
  assert.match(text, /Image generated — gpt-image-2\.5-flare, 1024x1024, 2 image/);
  assert.match(text, /Estimated list cost: \$0\.0800 USD/);
  assert.match(text, /https:\/\/cdn\.normahub\.cc\/x\.png/);
});

test("video tool resolves a live model, polls with progress and reports cost", async () => {
  const progress: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/videos") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, "grok-imagine-video-1.5");
      assert.equal(body.duration, 5);
      assert.equal(body.aspect_ratio, "16:9");
      return new Response(JSON.stringify({ id: "task-1", status: "queued" }), { status: 200 });
    }
    if (url.includes("/videos/status/task-1")) {
      return new Response(
        JSON.stringify({ id: "task-1", status: "completed", video_url: "https://cdn.normahub.cc/v.mp4" }),
        { status: 200 }
      );
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;

  const result = await handleVideoTool(
    { prompt: "drone over a lake", duration: 5, aspect_ratio: "16:9" },
    {
      _meta: { progressToken: "p1" },
      sendNotification: async (notification) => {
        progress.push(notification.params ?? {});
      },
    }
  );

  assert.equal(await defaultVideoModelId(), "grok-imagine-video-1.5");
  assert.match(textOf(result), /task task-1/);
  assert.match(textOf(result), /https:\/\/cdn\.normahub\.cc\/v\.mp4/);
  assert.match(textOf(result), /~\$1\.0000 USD/);
  assert.ok(progress.length >= 1, "at least the queued notification is sent");
});

test("video tool rejects a stale hardcoded model id with suggestions", async () => {
  await assert.rejects(
    () => handleVideoTool({ prompt: "x", model: "seedance-2.5" }),
    /Unknown model "seedance-2\.5"/
  );
  await assert.rejects(
    () => handleVideoTool({ prompt: "x", aspect_ratio: "wide" }),
    /aspect_ratio must look like/
  );
  await assert.rejects(
    () => handleImageTool({ prompt: "x", model: "claude-sonnet-5-5" }),
    /is a llm model/
  );
});

test("balance reports auth failures instead of a fake positive balance", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "invalid api key", code: "invalid_api_key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  await assert.rejects(
    () => handleBalanceTool({}),
    (error: unknown) =>
      error instanceof NormaHubApiError &&
      error.status === 401 &&
      /invalid api key/.test(error.message)
  );

  globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
  const text = textOf(await handleBalanceTool({}));
  assert.match(text, /does not expose \/v1\/balance/);
  assert.match(text, /Do not assume a positive balance/);
});

test("missing API key fails with an actionable message, not a 401", async () => {
  CONFIG.apiKey = "";
  await assert.rejects(() => handleChatTool({ model: "claude-sonnet-5-5", prompt: "x" }), /NORMAHUB_API_KEY/);
  CONFIG.apiKey = "test-key";
});

test("audio tool checks the source and picks the real content type", async () => {
  await assert.rejects(() => handleAudioTool({}), /Provide 'file_path' or 'url'/);
  await assert.rejects(() => handleAudioTool({ file_path: "/nope/missing.mp3" }), /not found/);
  await assert.rejects(() => handleAudioTool({ url: "ftp://host/a.mp3" }), /Only http/);
  assert.equal(mimeTypeFor("voice.M4A"), "audio/mp4");
  assert.equal(mimeTypeFor("clip.mp3"), "audio/mpeg");
  assert.equal(mimeTypeFor("unknown.bin"), "application/octet-stream");
});