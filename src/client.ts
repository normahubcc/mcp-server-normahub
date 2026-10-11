/**
 * NormaHub API HTTP Client
 * Uses native fetch (Node 18+) without external HTTP libraries.
 */

import { CONFIG } from "./config.js";
import {
  NormaHubChatRequest,
  NormaHubChatResponse,
  NormaHubGatewayStatus,
  NormaHubImageResponse,
  NormaHubVideoTask,
} from "./types.js";

export class NormaHubClient {
  private get headers(): Record<string, string> {
    return {
      "Authorization": `Bearer ${CONFIG.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "NormaHub-MCP-Server/0.1.0",
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${CONFIG.baseUrl}/${endpoint.replace(/^\/+/, "")}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...(options.headers || {}),
      },
    });

    const reqId = response.headers.get("x-request-id");
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      let parsedMsg = errorText;
      let parsedCode = "";
      try {
        const errJson = JSON.parse(errorText);
        parsedMsg = errJson.error?.message || errorText;
        parsedCode = errJson.error?.code || "";
      } catch {}
      const suffix = reqId ? ` [Request ID: ${reqId}]` : "";
      throw new Error(
        `NormaHub API Error (${response.status}${parsedCode ? ` / ${parsedCode}` : ""}): ${parsedMsg}${suffix}`
      );
    }

    const data: any = await response.json();
    if (reqId && typeof data === "object" && data !== null) {
      data._requestId = reqId;
    }
    return data as T;
  }

  /**
   * Prompts any text/code model (Claude Sonnet 5.5, GPT-6 Sol, DeepSeek v4.1, etc.)
   */
  async createChatCompletion(request: NormaHubChatRequest): Promise<NormaHubChatResponse> {
    return this.request<NormaHubChatResponse>("chat/completions", {
      method: "POST",
      body: JSON.stringify({ ...request, stream: false }),
    });
  }

  /**
   * Generates images using models like gpt-image-2.5-flare or grok-imagine-image-2.0
   */
  async generateImage(prompt: string, model: string = "gpt-image-2.5-flare"): Promise<NormaHubImageResponse> {
    return this.request<NormaHubImageResponse>("images/generations", {
      method: "POST",
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "1024x1024",
      }),
    });
  }

  /**
   * Submits a video generation task (SeeDance 2.5 / Grok Video)
   * Official NormaHub endpoint is POST /v1/videos with model & prompt
   */
  async createVideoTask(
    prompt: string,
    model: string = "seedance-2.5",
    imageUrl?: string
  ): Promise<NormaHubVideoTask> {
    const body: Record<string, any> = { model, prompt };
    if (imageUrl) {
      body.image_url = imageUrl;
    }
    try {
      return await this.request<NormaHubVideoTask>("videos", {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      if (err?.message?.includes("404")) {
        return await this.request<NormaHubVideoTask>("videos/generations", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      throw err;
    }
  }

  /**
   * Submits an Image-to-Video generation task (SeeDance 2.5 / 2.0)
   */
  async createImageToVideoTask(
    imageUrl: string,
    prompt: string,
    model: string = "seedance-2.5"
  ): Promise<NormaHubVideoTask> {
    return this.createVideoTask(prompt, model, imageUrl);
  }

  /**
   * Checks the status of a video generation task
   * Official NormaHub endpoint is GET /v1/videos/status/{taskId}
   */
  async getVideoTaskStatus(taskId: string): Promise<NormaHubVideoTask> {
    try {
      return await this.request<NormaHubVideoTask>(`videos/status/${taskId}`);
    } catch (err: any) {
      if (err?.message?.includes("404")) {
        return await this.request<NormaHubVideoTask>(`videos/tasks/${taskId}`);
      }
      throw err;
    }
  }

  /**
   * Polls a video task until completion or timeout
   */
  async pollVideoUntilDone(taskId: string, timeoutMs: number = 180_000): Promise<NormaHubVideoTask> {
    const startTime = Date.now();
    let delayMs = 3000;

    while (Date.now() - startTime < timeoutMs) {
      const task = await this.getVideoTaskStatus(taskId);
      if (task.status === "completed" || task.status === "failed") {
        return task;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 1.25, 8000);
    }

    throw new Error(`Video task ${taskId} timed out after ${timeoutMs / 1000} seconds`);
  }

  /**
   * Gets models and account overview
   */
  async getModels(): Promise<any> {
    return this.request<any>("models");
  }

  /**
   * Measures gateway ping latency and connection health
   */
  async getGatewayStatus(): Promise<NormaHubGatewayStatus> {
    const startTime = Date.now();
    let status: "operational" | "degraded" | "unreachable" = "operational";
    let pingMs = 0;

    try {
      await this.getModels();
      pingMs = Date.now() - startTime;
    } catch {
      pingMs = Date.now() - startTime;
      status = "degraded";
    }

    return {
      status,
      pingMs,
      baseUrl: CONFIG.baseUrl,
      timestamp: new Date().toISOString(),
      activeModelsCount: 30,
      directRussianRouting: true,
      rubleBilling: true,
      endpoints: {
        chat: `${CONFIG.baseUrl}/chat/completions`,
        responses: `${CONFIG.baseUrl}/responses`,
        messages: `https://api.normahub.cc/v1/messages`,
        images: `${CONFIG.baseUrl}/images/generations`,
        videos: `${CONFIG.baseUrl}/videos`,
        videoStatus: `${CONFIG.baseUrl}/videos/status/{taskId}`,
        models: `${CONFIG.baseUrl}/models`,
      },
    };
  }
}

export const apiClient = new NormaHubClient();
