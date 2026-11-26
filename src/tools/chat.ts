/**
 * MCP tool: prompt an LLM through NormaHub.
 */

import { CONFIG } from "../config.js";
import { apiClient } from "../client.js";
import { findModel, loadCatalog, requireModel } from "../catalog.js";
import { ToolInputError } from "../errors.js";
import { optionalMessages, optionalNumber, optionalString } from "../args.js";

export const CHAT_TOOL_DEFINITION = {
  name: "normahub_prompt_model",
  description:
    "Send a prompt or a full chat history to a text model through NormaHub (Claude, GPT, Gemini, DeepSeek, Qwen, Grok). " +
    "Returns the answer with token usage and the estimated USD cost of the call.",
  inputSchema: {
    type: "object",
    properties: {
      model: {
        type: "string",
        description:
          "Model id from normahub_list_models (e.g. claude-sonnet-5-5, gpt-6-astra, deepseek-v4.1-flash-1017, gemini-4-argon).",
      },
      prompt: {
        type: "string",
        description: "User message. Ignored if the same text is already the last message in `messages`.",
      },
      messages: {
        type: "array",
        description: "Full chat history: [{role: 'system'|'user'|'assistant', content: string}].",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["system", "user", "assistant"] },
            content: { type: "string" },
          },
          required: ["role", "content"],
        },
      },
      system: { type: "string", description: "System instruction. Prepended when messages has no system turn." },
      temperature: { type: "number", description: "Sampling temperature, 0.0–2.0 (default 0.7)." },
      max_tokens: { type: "number", description: "Maximum output tokens." },
    },
  },
};

export async function handleChatTool(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const catalog = await loadCatalog();
  const requested = optionalString(args, "model") ?? CONFIG.defaultModel;
  const model = requireModel(catalog, requested, "llm");

  const prompt = optionalString(args, "prompt");
  const history = optionalMessages(args);
  const system = optionalString(args, "system");
  const temperature = optionalNumber(args, "temperature", { min: 0, max: 2 });
  const maxTokens = optionalNumber(args, "max_tokens", { min: 1, max: 1_000_000 });

  if (!prompt && !history) {
    throw new ToolInputError("Provide either 'prompt' or a non-empty 'messages' array.");
  }

  const messages = history ? [...history] : [];
  if (system && messages[0]?.role !== "system") messages.unshift({ role: "system", content: system });
  if (prompt && messages[messages.length - 1]?.content !== prompt) {
    messages.push({ role: "user", content: prompt });
  }
  if (messages.length === 0) {
    throw new ToolInputError("The resulting conversation is empty.");
  }

  const response = await apiClient.createChatCompletion({
    model: model.id,
    messages,
    temperature: temperature ?? 0.7,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  });

  const content = response.choices?.[0]?.message?.content;
  const finishReason = response.choices?.[0]?.finish_reason;
  if (!content) {
    throw new Error(
      `Model "${model.id}" returned no text (finish_reason: ${finishReason ?? "unknown"}). ` +
        "Try a different model or a shorter prompt."
    );
  }

  const usage = response.usage;
  const cost = await estimateTextCost(model.id, usage?.prompt_tokens, usage?.completion_tokens);
  const meta = [
    `model: ${model.id}`,
    usage ? `tokens: ${usage.prompt_tokens} in / ${usage.completion_tokens} out / ${usage.total_tokens} total` : "tokens: not reported",
    cost === null ? null : `estimated cost: $${cost.toFixed(6)}`,
    finishReason ? `finish_reason: ${finishReason}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" | ");

  return { content: [{ type: "text", text: `[${meta}]\n\n${content}` }] };
}

async function estimateTextCost(
  modelId: string,
  inputTokens?: number,
  outputTokens?: number
): Promise<number | null> {
  if (inputTokens === undefined && outputTokens === undefined) return null;
  // Hits the in-memory catalog cache — no extra network call on the response path.
  const catalog = await loadCatalog();
  const model = findModel(catalog, modelId);
  if (!model || model.pricing.inputPer1M === null || model.pricing.outputPer1M === null) return null;
  return (
    ((inputTokens ?? 0) * model.pricing.inputPer1M +
      (outputTokens ?? 0) * model.pricing.outputPer1M) /
    1_000_000
  );
}