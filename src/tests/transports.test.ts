import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import { startHttpServer } from "../http.js";
import { VERSION } from "../version.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function connect<T extends { close: () => Promise<void> }>(
  transport: T
): Promise<{ client: Client; transport: T }> {
  const client = new Client({ name: "transport-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport as never);
  return { client, transport };
}

test("stdio: the published entry point speaks the protocol and keeps stdout clean", async () => {
  const stderr: string[] = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(packageRoot, "dist", "index.js")],
    env: {
      ...(process.env as Record<string, string>),
      NORMAHUB_OFFLINE: "1",
      NORMAHUB_API_KEY: "test-key",
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf-8")));

  const { client } = await connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 8);

    const result = await client.callTool({ name: "normahub_list_models", arguments: { limit: 3 } });
    const text = (result.content as Array<{ text?: string }>).map((item) => item.text ?? "").join("\n");
    assert.match(text, /source: bundled/, "NORMAHUB_OFFLINE must be honoured by the shipped binary");
    assert.match(text, /WARNING: NORMAHUB_OFFLINE/);

    const banner = stderr.join("");
    assert.match(banner, new RegExp(`NormaHub MCP Server ${VERSION.replace(/\./g, "\\.")} ready on stdio`));
  } finally {
    await client.close();
  }
});

test("streamable HTTP: /mcp serves the current transport", async () => {
  const running = await startHttpServer({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${running.port}`;

  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const body = (await health.json()) as Record<string, unknown>;
    assert.equal(body.version, VERSION);
    assert.equal(body.tools, 8);
    assert.equal(body.transports && typeof body.transports === "object", true);

    const { client } = await connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`))
    );
    try {
      const { tools } = await client.listTools();
      assert.equal(tools.length, 8);
      const result = await client.callTool({ name: "normahub_list_models", arguments: {} });
      assert.notEqual(result.isError, true);
    } finally {
      await client.close();
    }

    const notFound = await fetch(`${base}/nope`);
    assert.equal(notFound.status, 404);
    const wrongMethod = await fetch(`${base}/mcp`);
    assert.equal(wrongMethod.status, 405);
  } finally {
    await running.close();
  }
});

test("legacy SSE: /sse + /messages still work for older clients", async () => {
  const running = await startHttpServer({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${running.port}`;

  try {
    const { client } = await connect(new SSEClientTransport(new URL(`${base}/sse`)));
    try {
      const { resources } = await client.listResources();
      assert.equal(resources.length, 2);
      const result = await client.callTool({ name: "normahub_list_models", arguments: {} });
      assert.notEqual(result.isError, true);
    } finally {
      await client.close();
    }

    const missingSession = await fetch(`${base}/messages?sessionId=gone`, { method: "POST" });
    assert.equal(missingSession.status, 404);
  } finally {
    await running.close();
  }
});

test("SSE session cap returns 503 instead of growing without bound", async () => {
  const running = await startHttpServer({ port: 0, host: "127.0.0.1", maxSessions: 1 });
  const base = `http://127.0.0.1:${running.port}`;

  try {
    const first = await connect(new SSEClientTransport(new URL(`${base}/sse`)));
    try {
      const response = await fetch(`${base}/sse`, { headers: { Accept: "text/event-stream" } });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("retry-after"), "30");
      await response.body?.cancel();
    } finally {
      await first.client.close();
    }
  } finally {
    await running.close();
  }
});