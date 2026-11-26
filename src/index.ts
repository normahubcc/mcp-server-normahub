#!/usr/bin/env node
/**
 * Stdio entry point — the transport used by Cursor, Claude Desktop, Zed and
 * Continue. `npx -y @normahub/mcp-server`.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNormaHubServer } from "./server.js";
import { VERSION } from "./version.js";

function usage(): string {
  return [
    `NormaHub MCP Server ${VERSION}`,
    "",
    "Usage:",
    "  normahub-mcp                 start the stdio server (MCP clients)",
    "  normahub-mcp --version       print the version",
    "  normahub-mcp --help          print this help",
    "",
    "Environment:",
    "  NORMAHUB_API_KEY             required for chat, image, video and audio",
    "  NORMAHUB_BASE_URL            default https://api.normahub.cc/v1",
    "  NORMAHUB_DEFAULT_MODEL       default claude-sonnet-5-5",
    "  NORMAHUB_OFFLINE             set to 1 to use the bundled catalog only",
    "",
    "HTTP and SSE transports are served by normahub-mcp-http (port 3001 by default).",
    "",
  ].join("\n");
}

/**
 * Handles the flags a registry reviewer or a user runs by hand. Returns true
 * when the process should stop here, so the stdio server never starts and
 * stdout stays clean for the protocol.
 */
function handleCli(argv: readonly string[]): boolean {
  if (argv.includes("--version") || argv.includes("-V")) {
    process.stdout.write(`${VERSION}\n`);
    return true;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(usage());
    return true;
  }
  return false;
}

async function main(): Promise<void> {
  const server = createNormaHubServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout belongs to the protocol; diagnostics must go to stderr.
  console.error(`NormaHub MCP Server ${VERSION} ready on stdio.`);

  const shutdown = async () => {
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

if (!handleCli(process.argv.slice(2))) {
  main().catch((error: unknown) => {
    console.error(
      `Fatal error starting NormaHub MCP Server: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
