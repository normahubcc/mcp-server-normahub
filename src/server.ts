/**
 * NormaHub MCP server factory.
 * Wires tools, resources and prompts onto one SDK `Server` instance.
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
import { SERVER_NAME, VERSION } from "./version.js";
import { CHAT_TOOL_DEFINITION, handleChatTool } from "./tools/chat.js";
import {
  IMAGE_TO_VIDEO_TOOL_DEFINITION,
  VIDEO_TOOL_DEFINITION,
  handleImageToVideoTool,
  handleVideoTool,
} from "./tools/video.js";
import { IMAGE_TOOL_DEFINITION, handleImageTool } from "./tools/image.js";
import {
  ACCOUNT_TOOL_DEFINITION,
  BALANCE_TOOL_DEFINITION,
  ESTIMATE_COST_TOOL_DEFINITION,
  handleAccountTool,
  handleBalanceTool,
  handleEstimateCostTool,
} from "./tools/account.js";
import { AUDIO_TOOL_DEFINITION, handleAudioTool } from "./tools/audio.js";
import { RESOURCE_DEFINITIONS, handleReadResource } from "./resources/index.js";
import { PROMPT_DEFINITIONS, handleGetPrompt } from "./prompts/index.js";
import type { ToolContext } from "./tools/context.js";

const TOOL_DEFINITIONS = [
  ACCOUNT_TOOL_DEFINITION,
  CHAT_TOOL_DEFINITION,
  IMAGE_TOOL_DEFINITION,
  IMAGE_TO_VIDEO_TOOL_DEFINITION,
  VIDEO_TOOL_DEFINITION,
  AUDIO_TOOL_DEFINITION,
  ESTIMATE_COST_TOOL_DEFINITION,
  BALANCE_TOOL_DEFINITION,
];

const INSTRUCTIONS = [
  "NormaHub gives access to LLMs, image and video models through one API (https://api.normahub.cc/v1).",
  "Start with normahub_list_models to get real model ids and current prices — model names change and guessing ids wastes paid calls.",
  "Use normahub_estimate_cost before expensive work (video especially) so the user sees the price first.",
  "normahub_prompt_model takes either a prompt or a full messages array; normahub_generate_image and normahub_generate_video accept a model id from the catalog.",
  "Read normahub://models for the whole catalog and normahub://status for gateway reachability.",
  "Every paid call is billed to the user's NormaHub account; do not retry a generation blindly after an error.",
].join(" ");

export function createNormaHubServer(): Server {
  validateConfig();

  const server = new Server(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const context = extra as unknown as ToolContext | undefined;

    try {
      switch (name) {
        case "normahub_list_models":
          return await handleAccountTool(args);
        case "normahub_prompt_model":
          return await handleChatTool(args);
        case "normahub_generate_image":
          return await handleImageTool(args);
        case "normahub_generate_video":
          return await handleVideoTool(args, context);
        case "normahub_image_to_video":
          return await handleImageToVideoTool(args, context);
        case "normahub_transcribe_audio":
          return await handleAudioTool(args);
        case "normahub_estimate_cost":
          return await handleEstimateCostTool(args);
        case "normahub_get_balance":
          return await handleBalanceTool(args);
        default: {
          const known = TOOL_DEFINITIONS.map((tool) => tool.name).join(", ");
          return {
            content: [{ type: "text", text: `Unknown tool "${name}". Available tools: ${known}.` }],
            isError: true,
          };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCE_DEFINITIONS }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      return await handleReadResource(request.params.uri);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPT_DEFINITIONS }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    try {
      return await handleGetPrompt(request.params.name, request.params.arguments ?? {});
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  });

  return server;
}

/** Exported for tests and for the HTTP health endpoint. */
export const SERVER_INFO = { name: SERVER_NAME, version: VERSION, tools: TOOL_DEFINITIONS.length };