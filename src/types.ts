/**
 * Types and interfaces for NormaHub MCP Server
 */

export interface NormaHubChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NormaHubChatRequest {
  model: string;
  messages: NormaHubChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface NormaHubChatResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface NormaHubVideoTask {
  id: string;
  model: string;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  video_url?: string;
  error?: string;
  image_url?: string;
  created_at?: number;
}

export interface NormaHubImageResponse {
  created: number;
  data: Array<{
    url: string;
    b64_json?: string;
  }>;
}

export interface NormaHubModelMeta {
  id: string;
  name: string;
  family: string;
  category: "llm" | "image" | "video";
  context: string;
  capabilities: string[];
  pricing: {
    inputPer1M?: string;
    outputPer1M?: string;
    fixed?: string;
  };
  description: string;
}

export interface NormaHubGatewayStatus {
  status: "operational" | "degraded" | "unreachable";
  pingMs: number;
  baseUrl: string;
  timestamp: string;
  activeModelsCount: number;
  directRussianRouting: boolean;
  rubleBilling: boolean;
  endpoints: {
    chat: string;
    responses: string;
    messages: string;
    images: string;
    videos: string;
    videoStatus: string;
    models: string;
  };
}
