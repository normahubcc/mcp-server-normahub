/**
 * MCP Tool: prompt_model
 * Prompts any of the 30 available LLMs on NormaHub.
 */

import { apiClient } from "../client.js";

export const CHAT_TOOL_DEFINITION = {
  name: "normahub_prompt_model",
  description: "Send a prompt to LLM models via NormaHub API (Claude, GPT, DeepSeek, Qwen).",
  inputSchema: {
    type: "object",
    properties: {
      model: {
        type: "string",
        description: "Model ID. Examples: claude-sonnet-5-5, deepseek-v4.1-flash, grok-4.7, glm-5.3-flash",
        default: "claude-sonnet-5-5",
      },
      prompt: {
        type: "string",
        description: "The prompt or task instruction for the AI model (required if messages is not provided)",
      },
      messages: {
        type: "array",
        description: "Full chat message history array: [{role: 'system'|'user'|'assistant', content: string}]",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: ["system", "user", "assistant"],
              description: "Message author role",
            },
            content: {
              type: "string",
              description: "Message text content",
            },
          },
          required: ["role", "content"],
        },
      },
      system: {
        type: "string",
        description: "Optional system prompt instruction",
      },
      temperature: {
        type: "number",
        description: "Sampling temperature (0.0 to 1.0)",
        default: 0.7,
      },
      max_tokens: {
        type: "number",
        description: "Optional max output tokens limit",
      },
    },
  },
};

export async function handleChatTool(args: any): Promise<any> {
  const model = args.model || "claude-sonnet-5-5";
  let messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (Array.isArray(args.messages) && args.messages.length > 0) {
    messages = [...args.messages];
    if (args.system && messages[0]?.role !== "system") {
      messages.unshift({ role: "system", content: args.system });
    }
    if (args.prompt && messages[messages.length - 1]?.content !== args.prompt) {
      messages.push({ role: "user", content: args.prompt });
    }
  } else if (args.prompt) {
    if (args.system) {
      messages.push({ role: "system", content: args.system });
    }
    messages.push({ role: "user", content: args.prompt });
  } else {
    throw new Error("Either 'prompt' or 'messages' array must be provided to normahub_prompt_model.");
  }

  const response = await apiClient.createChatCompletion({
    model,
    messages,
    temperature: args.temperature ?? 0.7,
    max_tokens: args.max_tokens,
  });

  const content = response.choices?.[0]?.message?.content || "No response received";
  const tokens = response.usage?.total_tokens ?? 0;

  return {
    content: [
      {
        type: "text",
        text: `[Model: ${model} | Tokens: ${tokens}]\n\n${content}`,
      },
    ],
  };
}
