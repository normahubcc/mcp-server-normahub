/**
 * HTTP transports for the NormaHub MCP server.
 *
 * - `POST /mcp` — Streamable HTTP, the transport the MCP specification
 *   recommends for remote servers (the SDK marks HTTP+SSE "for backwards
 *   compatibility only").
 * - `GET /sse` + `POST /messages` — legacy HTTP+SSE, kept for existing clients.
 * - `GET /health` — liveness with version, no network calls.
 *
 * Previously the server exposed only the legacy transport, had no session cap
 * (every SSE connection leaked until disconnect), and no keep-alive, so proxies
 * closed idle streams mid-render.
 */

import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createNormaHubServer, SERVER_INFO } from "./server.js";
import { VERSION } from "./version.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const SSE_KEEPALIVE_MS = 25_000;
const DEFAULT_MAX_SESSIONS = 64;

export interface HttpServerOptions {
  port?: number;
  host?: string;
  maxSessions?: number;
}

export interface RunningHttpServer {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

function json(res: http.ServerResponse, status: number, body: unknown, extraHeaders = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function rpcError(res: http.ServerResponse, status: number, code: number, message: string): void {
  json(res, status, { jsonrpc: "2.0", error: { code, message }, id: null });
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { status: 413 });
    }
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf-8");
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Request body is not valid JSON"), { status: 400 });
  }
}

export function createHttpServer(options: HttpServerOptions = {}): RunningHttpServer {
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const sessions = new Map<string, SSEServerTransport>();
  const keepAliveTimers = new Map<string, NodeJS.Timeout>();
  const startedAt = Date.now();

  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID"
    );
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const hostHeader = req.headers.host ?? `localhost:${options.port ?? 3001}`;
    let pathname: string;
    let searchParams: URLSearchParams;
    try {
      const url = new URL(req.url ?? "/", `http://${hostHeader}`);
      pathname = url.pathname;
      searchParams = url.searchParams;
    } catch {
      json(res, 400, { error: "Malformed request URL" });
      return;
    }

    if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
      json(res, 200, {
        status: "operational",
        server: SERVER_INFO.name,
        version: VERSION,
        tools: SERVER_INFO.tools,
        uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
        active_sse_sessions: sessions.size,
        max_sse_sessions: maxSessions,
        transports: {
          streamable_http: `http://${hostHeader}/mcp`,
          sse: `http://${hostHeader}/sse`,
          messages: `http://${hostHeader}/messages?sessionId=<id>`,
        },
        auth: "NORMAHUB_API_KEY is read from the server environment, not from requests.",
      });
      return;
    }

    // --- Streamable HTTP (current specification) ---
    if (pathname === "/mcp") {
      if (req.method !== "POST") {
        rpcError(res, 405, -32000, "Method not allowed. Streamable HTTP uses POST /mcp.");
        return;
      }
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        rpcError(res, (error as { status?: number }).status ?? 400, -32600, (error as Error).message);
        return;
      }

      const mcpServer = createNormaHubServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close().catch(() => {});
        void mcpServer.close().catch(() => {});
      });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (error) {
        if (!res.headersSent) {
          rpcError(res, 500, -32603, `Internal error: ${(error as Error).message}`);
        } else {
          res.end();
        }
      }
      return;
    }

    // --- Legacy HTTP + SSE ---
    if (req.method === "GET" && pathname === "/sse") {
      if (sessions.size >= maxSessions) {
        json(res, 503, { error: "Too many active SSE sessions. Retry later." }, { "Retry-After": "30" });
        return;
      }

      try {
        const transport = new SSEServerTransport("/messages", res);
        const sessionId = transport.sessionId;
        sessions.set(sessionId, transport);

        const keepAlive = setInterval(() => {
          if (!res.writableEnded) res.write(": keepalive\n\n");
        }, SSE_KEEPALIVE_MS);
        keepAlive.unref();
        keepAliveTimers.set(sessionId, keepAlive);

        const cleanup = () => {
          const timer = keepAliveTimers.get(sessionId);
          if (timer) clearInterval(timer);
          keepAliveTimers.delete(sessionId);
          sessions.delete(sessionId);
        };
        transport.onclose = cleanup;
        res.on("close", cleanup);

        const mcpServer = createNormaHubServer();
        await mcpServer.connect(transport);
      } catch (error) {
        if (!res.headersSent) {
          json(res, 500, { error: `Failed to open SSE stream: ${(error as Error).message}` });
        } else {
          res.end();
        }
      }
      return;
    }

    if (req.method === "POST" && pathname === "/messages") {
      const sessionId = searchParams.get("sessionId");
      if (!sessionId) {
        json(res, 400, { error: "Missing sessionId query parameter." });
        return;
      }
      const transport = sessions.get(sessionId);
      if (!transport) {
        json(res, 404, { error: `Session ${sessionId} not found or expired.` });
        return;
      }
      try {
        await transport.handlePostMessage(req, res);
      } catch (error) {
        if (!res.headersSent) {
          json(res, 500, { error: `Failed to handle message: ${(error as Error).message}` });
        } else {
          res.end();
        }
      }
      return;
    }

    json(res, 404, {
      error: `Not found: ${pathname}`,
      endpoints: ["/health", "/mcp", "/sse", "/messages"],
    });
  });

  // SSE streams are long-lived; do not let a proxy timeout kill them.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  const close = async (): Promise<void> => {
    for (const timer of keepAliveTimers.values()) clearInterval(timer);
    keepAliveTimers.clear();
    for (const transport of sessions.values()) {
      await transport.close().catch(() => {});
    }
    sessions.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { server, port: 0, close };
}

/** Starts the server and resolves once the real port is known (supports port 0). */
export async function startHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const running = createHttpServer(options);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const port = options.port ?? Number(process.env.PORT ?? process.env.NORMAHUB_MCP_PORT ?? 3001);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    running.server.once("error", onError);
    running.server.listen(port, host, () => {
      running.server.off("error", onError);
      resolve();
    });
  });

  const address = running.server.address();
  running.port = typeof address === "object" && address ? address.port : port;
  return running;
}