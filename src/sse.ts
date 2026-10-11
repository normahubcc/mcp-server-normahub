#!/usr/bin/env node
/**
 * NormaHub Model Context Protocol (MCP) Server.
 * Server-Sent Events (SSE) Transport entry point for remote/Docker deployments.
 */

import http from "node:http";
import { URL } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createNormaHubServer } from "./server.js";

const PORT = parseInt(process.env.PORT || process.env.NORMAHUB_MCP_PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

const transports = new Map<string, SSEServerTransport>();

const server = http.createServer(async (req, res) => {
  // CORS Headers for browser clients & MCP Inspector
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const reqUrl = new URL(req.url || "/", `http://${hostHeader}`);
  const pathname = reqUrl.pathname;

  // 1. Health check & status endpoint
  if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          status: "operational",
          server: "normahub-mcp-server",
          version: "0.2.0",
          transport: "sse",
          active_sessions: transports.size,
          endpoints: {
            sse: `http://${hostHeader}/sse`,
            messages: `http://${hostHeader}/messages`,
            health: `http://${hostHeader}/health`,
          },
          description: "Connect 30 AI models, SeeDance video and image tools without VPN.",
        },
        null,
        2
      )
    );
    return;
  }

  // 2. Establish SSE Stream (GET /sse)
  if (req.method === "GET" && pathname === "/sse") {
    try {
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);

      transport.onclose = () => {
        transports.delete(sessionId);
      };

      const mcpServer = createNormaHubServer();
      await mcpServer.connect(transport);
      return;
    } catch (error: any) {
      console.error("[SSE Error] Failed to establish SSE transport:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error?.message || "Internal server error" }));
      }
      return;
    }
  }

  // 3. Receive client POST messages (POST /messages?sessionId=...)
  if (req.method === "POST" && pathname === "/messages") {
    const sessionId = reqUrl.searchParams.get("sessionId");

    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required 'sessionId' query parameter." }));
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Session "${sessionId}" not found or expired.` }));
      return;
    }

    try {
      await transport.handlePostMessage(req, res);
      return;
    } catch (error: any) {
      console.error(`[SSE Error] Failed to handle message for session ${sessionId}:`, error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error?.message || "Internal server error" }));
      }
      return;
    }
  }

  // 4. Default 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
});

server.listen(PORT, HOST, () => {
  console.log(`⚡ NormaHub MCP Server running on SSE transport (v0.2.0)`);
  console.log(`🌐 SSE Endpoint:     http://${HOST}:${PORT}/sse`);
  console.log(`📬 Message Endpoint: http://${HOST}:${PORT}/messages`);
  console.log(`🩺 Health check:     http://${HOST}:${PORT}/health`);
});

// Graceful shutdown
function shutdown() {
  console.log("\nShutting down NormaHub SSE Server...");
  for (const transport of transports.values()) {
    transport.close().catch(() => {});
  }
  transports.clear();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
