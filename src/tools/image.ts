/**
 * MCP Tool: generate_image
 * Generates images using GPT Image Flare or Grok Imagine Image.
 */

import { apiClient } from "../client.js";

export const IMAGE_TOOL_DEFINITION = {
  name: "normahub_generate_image",
  description: "Generate high-resolution AI images using GPT Image 2.5 Flare or Grok Imagine Image 2.0 via NormaHub API.",
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
  const model = args.model || "gpt-image-2.5-flare";
  const res = await apiClient.generateImage(args.prompt, model);
  const imageUrl = res.data?.[0]?.url || "No image URL returned";

  return {
    content: [
      {
        type: "text",
        text: `🎨 Image generated using ${model}:\n${imageUrl}`,
      },
    ],
  };
}
