/**
 * NormaHub MCP Server factory.
 * Registers Tools, Resources, and Prompts according to the MCP specification.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { validateConfig } from "./config.js";
import { CHAT_TOOL_DEFINITION, handleChatTool } from "./tools/chat.js";
import {
  IMAGE_TO_VIDEO_TOOL_DEFINITION,
  VIDEO_TOOL_DEFINITION,
  handleImageToVideoTool,
  handleVideoTool,
} from "./tools/video.js";
import { IMAGE_TOOL_DEFINITION, handleImageTool } from "./tools/image.js";
import { ACCOUNT_TOOL_DEFINITION, handleAccountTool } from "./tools/account.js";
import { RESOURCE_DEFINITIONS, handleReadResource } from "./resources/index.js";
import { PROMPT_DEFINITIONS, handleGetPrompt } from "./prompts/index.js";

export function createNormaHubServer(): Server {
  validateConfig();

  const server = new Server(
    {
      name: "normahub-mcp-server",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // --- 1. TOOLS ---
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        CHAT_TOOL_DEFINITION,
        VIDEO_TOOL_DEFINITION,
        IMAGE_TO_VIDEO_TOOL_DEFINITION,
        IMAGE_TOOL_DEFINITION,
        ACCOUNT_TOOL_DEFINITION,
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "normahub_prompt_model":
          return await handleChatTool(args);
        case "normahub_generate_video":
          return await handleVideoTool(args);
        case "normahub_image_to_video":
          return await handleImageToVideoTool(args);
        case "normahub_generate_image":
          return await handleImageTool(args);
        case "normahub_list_models":
          return await handleAccountTool(args);
        default:
          throw new Error(`Unknown tool requested: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `[NormaHub MCP Error]: ${error?.message || String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // --- 2. RESOURCES ---
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: RESOURCE_DEFINITIONS,
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      return await handleReadResource(uri);
    } catch (error: any) {
      throw new Error(`[NormaHub Resource Error]: ${error?.message || String(error)}`);
    }
  });

  // --- 3. PROMPTS ---
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: PROMPT_DEFINITIONS,
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await handleGetPrompt(name, args || {});
    } catch (error: any) {
      throw new Error(`[NormaHub Prompt Error]: ${error?.message || String(error)}`);
    }
  });

  return server;
}
