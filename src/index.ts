#!/usr/bin/env node
/**
 * NormaHub Model Context Protocol (MCP) Server.
 * Stdio Transport entry point.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNormaHubServer } from "./server.js";

async function run(): Promise<void> {
  const server = createNormaHubServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("⚡ NormaHub MCP Server running on stdio transport (v0.2.0)");
}

run().catch((error) => {
  console.error("Fatal error starting NormaHub MCP Server:", error);
  process.exit(1);
});
