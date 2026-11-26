#!/usr/bin/env node
/**
 * HTTP entry point: Streamable HTTP at /mcp and legacy SSE at /sse.
 */

import { startHttpServer } from "./http.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
  const running = await startHttpServer();

  console.log(`NormaHub MCP Server ${VERSION} on HTTP`);
  console.log(`  Streamable HTTP (recommended): http://localhost:${running.port}/mcp`);
  console.log(`  Legacy SSE:                    http://localhost:${running.port}/sse`);
  console.log(`  Health:                        http://localhost:${running.port}/health`);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`\n${signal} received, closing ${running.port}…`);
    await running.close().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("EADDRINUSE")) {
    console.error(
      `Cannot start: port is already in use. Set PORT (or NORMAHUB_MCP_PORT) to a free port.\n${message}`
    );
  } else {
    console.error(`Fatal error starting the HTTP server: ${message}`);
  }
  process.exit(1);
});