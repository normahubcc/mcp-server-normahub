/**
 * MCP Tool: generate_image
 * Generates images using GPT Image Flare or Grok Imagine Image.
 */

import { apiClient } from "../client.js";

export const IMAGE_TOOL_DEFINITION = {
  name: "normahub_generate_image",
  description: "Generate images using GPT Image or Grok Imagine Image via NormaHub API.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Visual prompt describing the image to generate",
      },
      model: {
        type: "string",
        description: "Image model ID (gpt-image-2.5-flare, grok-imagine-image-2.0)",
        default: "gpt-image-2.5-flare",
      },
    },
    required: ["prompt"],
  },
};

export async function handleImageTool(args: any): Promise<any> {
  const model = args.model || "gpt-image-2";
  const res: any = await apiClient.generateImage(args.prompt, model);

  // NormaHub returns image either in result.data or top-level data array
  const imgItem = res?.result?.data?.[0] || res?.data?.[0];
  const url = imgItem?.url || "";
  const b64 = imgItem?.b64_json || "";
  const mimeType = imgItem?.mime_type || "image/png";

  if (url) {
    return {
      content: [
        {
          type: "text",
          text: `Image generated with ${model}:\n${url}`,
        },
      ],
    };
  } else if (b64) {
    return {
      content: [
        {
          type: "image",
          data: b64,
          mimeType,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Image generated with ${model} (Task ID: ${res?.id || "ok"}).`,
      },
    ],
  };
}
