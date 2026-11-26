/**
 * NormaHub API HTTP client.
 * Native fetch only — no HTTP dependency in a package that users install with npx.
 */

import { CONFIG } from "./config.js";
import { NormaHubApiError } from "./errors.js";
import { USER_AGENT } from "./version.js";
import type {
  NormaHubChatRequest,
  NormaHubChatResponse,
  NormaHubGatewayStatus,
  NormaHubImageResponse,
  NormaHubVideoTask,
} from "./types.js";

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

function errorMessageFrom(body: string, fallback: string): { message: string; code?: string } {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const error = parsed.error as Record<string, unknown> | string | undefined;
    if (typeof error === "string") return { message: error };
    if (error) {
      const message = typeof error.message === "string" ? error.message : undefined;
      const code = typeof error.code === "string" ? error.code : undefined;
      if (message) return { message, code };
    }
    if (typeof parsed.message === "string") return { message: parsed.message };
    if (typeof parsed.detail === "string") return { message: parsed.detail };
  } catch {
    /* body was not JSON — fall through to plain text */
  }
  return { message: body.trim() || fallback };
}

export class NormaHubClient {
  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${CONFIG.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    };
  }

  /** Fails early with an actionable message instead of a 401 from upstream. */
  private requireApiKey(): void {
    if (!CONFIG.apiKey) {
      throw new NormaHubApiError(
        "NORMAHUB_API_KEY is not configured. Set it in the MCP client configuration " +
          "(environment block) — keys are issued at https://normahub.cc/dashboard.",
        401
      );
    }
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    this.requireApiKey();

    const { timeoutMs = CONFIG.timeoutMs, headers, ...init } = options;
    const url = `${CONFIG.baseUrl}/${endpoint.replace(/^\/+/, "")}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...this.headers, ...(headers as Record<string, string> | undefined) },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new NormaHubApiError(`Request to ${url} timed out after ${timeoutMs} ms.`);
      }
      throw new NormaHubApiError(
        `Cannot reach NormaHub API at ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timer);
    }

    const requestId =
      response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const { message, code } = errorMessageFrom(body, response.statusText);
      const suffix = requestId ? ` [request id: ${requestId}]` : "";
      throw new NormaHubApiError(
        `NormaHub API ${response.status}${code ? ` (${code})` : ""}: ${message}${suffix}`,
        response.status,
        code,
        requestId
      );
    }

    const text = await response.text();
    if (!text) return {} as T;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new NormaHubApiError(
        `NormaHub API returned non-JSON for ${url} (first 120 chars): ${text.slice(0, 120)}`,
        response.status,
        undefined,
        requestId
      );
    }
    if (requestId && typeof data === "object" && data !== null) {
      (data as Record<string, unknown>)._requestId = requestId;
    }
    return data as T;
  }

  createChatCompletion(request: NormaHubChatRequest): Promise<NormaHubChatResponse> {
    return this.request<NormaHubChatResponse>("chat/completions", {
      method: "POST",
      body: JSON.stringify({ ...request, stream: false }),
    });
  }

  generateImage(
    prompt: string,
    model: string,
    options: { size?: string; n?: number } = {}
  ): Promise<NormaHubImageResponse> {
    return this.request<NormaHubImageResponse>("images/generations", {
      method: "POST",
      body: JSON.stringify({
        model,
        prompt,
        n: options.n ?? 1,
        size: options.size ?? "1024x1024",
      }),
      timeoutMs: 180_000,
    });
  }

  /**
   * Submits a video generation task. `POST /v1/videos` is the documented route;
   * the legacy `/v1/videos/generations` is tried only when the route is missing,
   * never because an arbitrary error message contained "404".
   */
  async createVideoTask(
    prompt: string,
    model: string,
    options: {
      imageUrl?: string;
      durationSeconds?: number;
      aspectRatio?: string;
      resolution?: string;
    } = {}
  ): Promise<NormaHubVideoTask> {
    const body: Record<string, unknown> = { model, prompt };
    if (options.imageUrl) body.image_url = options.imageUrl;
    if (options.durationSeconds !== undefined) body.duration = options.durationSeconds;
    if (options.aspectRatio) body.aspect_ratio = options.aspectRatio;
    if (options.resolution) body.resolution = options.resolution;

    try {
      return await this.request<NormaHubVideoTask>("videos", {
        method: "POST",
        body: JSON.stringify(body),
        timeoutMs: 60_000,
      });
    } catch (error) {
      if (error instanceof NormaHubApiError && error.isMissingEndpoint) {
        return this.request<NormaHubVideoTask>("videos/generations", {
          method: "POST",
          body: JSON.stringify(body),
          timeoutMs: 60_000,
        });
      }
      throw error;
    }
  }

  createImageToVideoTask(
    imageUrl: string,
    prompt: string,
    model: string,
    options: { durationSeconds?: number; aspectRatio?: string; resolution?: string } = {}
  ): Promise<NormaHubVideoTask> {
    return this.createVideoTask(prompt, model, { ...options, imageUrl });
  }

  async getVideoTaskStatus(taskId: string): Promise<NormaHubVideoTask> {
    try {
      return await this.request<NormaHubVideoTask>(`videos/status/${encodeURIComponent(taskId)}`);
    } catch (error) {
      if (error instanceof NormaHubApiError && error.isMissingEndpoint) {
        return this.request<NormaHubVideoTask>(`videos/tasks/${encodeURIComponent(taskId)}`);
      }
      throw error;
    }
  }

  /**
   * Polls until the task settles. `onPoll` lets the caller emit MCP progress
   * notifications so a 3-minute render does not look like a hang.
   */
  async pollVideoUntilDone(
    taskId: string,
    options: {
      timeoutMs?: number;
      onPoll?: (task: NormaHubVideoTask, elapsedMs: number) => void | Promise<void>;
    } = {}
  ): Promise<NormaHubVideoTask> {
    const timeoutMs = options.timeoutMs ?? 240_000;
    const startedAt = Date.now();
    let delayMs = 3000;

    while (Date.now() - startedAt < timeoutMs) {
      const task = await this.getVideoTaskStatus(taskId);
      if (task.status === "completed" || task.status === "failed") {
        return task;
      }
      if (options.onPoll) await options.onPoll(task, Date.now() - startedAt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(Math.round(delayMs * 1.25), 10_000);
    }

    throw new NormaHubApiError(
      `Video task ${taskId} did not finish within ${Math.round(timeoutMs / 1000)} s. ` +
        `It may still complete — query it later with the task id.`
    );
  }

  async getModels(): Promise<{ data?: Array<{ id?: string }> } & Record<string, unknown>> {
    return this.request("models");
  }

  /**
   * Balance is optional on the gateway. A 404 means "endpoint not offered";
   * anything else (401/403/5xx) is a real failure and must be shown, because
   * reporting "Active" for a rejected key is a lie the user pays for.
   */
  async getBalance(): Promise<Record<string, unknown> | null> {
    try {
      return await this.request<Record<string, unknown>>("balance");
    } catch (error) {
      if (error instanceof NormaHubApiError && error.isMissingEndpoint) return null;
      throw error;
    }
  }

  async transcribeAudio(
    audio: Buffer,
    filename: string,
    options: { model?: string; language?: string; prompt?: string } = {}
  ): Promise<{ text?: string; language?: string } & Record<string, unknown>> {
    this.requireApiKey();

    const safeName = filename.replace(/[\r\n"\\]/g, "_") || "audio.mp3";
    const mime = mimeTypeFor(safeName);
    const boundary = `----NormaHubBoundary${Math.random().toString(36).slice(2)}`;
    const crlf = "\r\n";
    const chunks: Buffer[] = [];

    const field = (name: string, value: string) => {
      chunks.push(
        Buffer.from(
          `--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`,
          "utf-8"
        )
      );
    };

    field("model", options.model ?? "whisper-1");
    if (options.language) field("language", options.language);
    if (options.prompt) field("prompt", options.prompt);
    chunks.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="${safeName}"${crlf}` +
          `Content-Type: ${mime}${crlf}${crlf}`,
        "utf-8"
      ),
      audio,
      Buffer.from(`${crlf}--${boundary}--${crlf}`, "utf-8")
    );

    const url = `${CONFIG.baseUrl}/audio/transcriptions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CONFIG.apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": USER_AGENT,
      },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(CONFIG.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const { message } = errorMessageFrom(body, response.statusText);
      throw new NormaHubApiError(
        `Transcription failed (${response.status}): ${message}`,
        response.status
      );
    }

    return (await response.json()) as { text?: string; language?: string };
  }

  async getGatewayStatus(activeModelsCount: number): Promise<NormaHubGatewayStatus> {
    const startedAt = Date.now();
    let status: NormaHubGatewayStatus["status"] = "operational";

    try {
      await this.request("models", { timeoutMs: 8000 });
    } catch {
      status = "degraded";
    }

    return {
      status,
      pingMs: Date.now() - startedAt,
      baseUrl: CONFIG.baseUrl,
      timestamp: new Date().toISOString(),
      activeModelsCount,
      directRussianRouting: true,
      rubleBilling: true,
      endpoints: {
        chat: `${CONFIG.baseUrl}/chat/completions`,
        responses: `${CONFIG.baseUrl}/responses`,
        messages: `${CONFIG.baseUrl}/messages`,
        images: `${CONFIG.baseUrl}/images/generations`,
        videos: `${CONFIG.baseUrl}/videos`,
        videoStatus: `${CONFIG.baseUrl}/videos/status/{taskId}`,
        models: `${CONFIG.baseUrl}/models`,
      },
    };
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};

export function mimeTypeFor(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export const apiClient = new NormaHubClient();