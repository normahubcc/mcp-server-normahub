/**
 * Single source of truth for the package version.
 *
 * The version lives in package.json only. Reading it at runtime (instead of
 * duplicating a string in every entry point) is what previously produced three
 * different versions in one release: `0.2.0` in the banners, `0.2.5` in the
 * handshake, `0.1.0` in the User-Agent.
 *
 * `dist/version.js` resolves `../package.json`, and npm always ships
 * package.json in the tarball, so this works both from a checkout and from an
 * installed package.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Reverse-DNS name required by the official MCP Registry (`mcpName` in package.json). */
export const SERVER_NAME = "io.github.normahubcc/mcp-server-normahub";

function readVersion(): string {
  try {
    const pkg = require("../package.json") as { version?: unknown };
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "0.0.0-unknown";
  } catch {
    return "0.0.0-unknown";
  }
}

export const VERSION: string = readVersion();

export const USER_AGENT = `NormaHub-MCP-Server/${VERSION}`;