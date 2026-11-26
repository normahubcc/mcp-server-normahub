/**
 * MCP tool: image generation.
 */

import { apiClient } from "../client.js";
import { loadCatalog, requireModel } from "../catalog.js";
import { optionalEnum, optionalNumber, optionalString, requiredString } from "../args.js";

const SIZES = ["1024x1024", "1536x1024", "1024x1536", "512x512"] as const;

export const IMAGE_TOOL_DEFINITION = {
  name: "normahub_generate_image",
  description:
    "Generate images with NormaHub image models (GPT Image, Grok Imagine Image). " +
    "Returns the image URL or inline image data, with the estimated cost per generation.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "What to draw: subject, style, composition, lighting, text if any." },
      model: {
        type: "string",
        description: "Image model id from normahub_list_models (category=image).",
      },
      size: { type: "string", enum: [...SIZES], description: "Output size, default 1024x1024." },
      n: { type: "number", description: "Number of images, 1–4 (default 1)." },
    },
    required: ["prompt"],
  },
};

export async function handleImageTool(
  args: unknown
): Promise<{ content: Array<Record<string, unknown>>; isError?: true }> {
  const prompt = requiredString(args, "prompt");
  const catalog = await loadCatalog();

  const requested = optionalString(args, "model");
  const model = requested
    ? requireModel(catalog, requested, "image")
    : catalog.models.find((m) => m.category === "image");
  if (!model) {
    throw new Error(
      "The catalog reports no image models right now. Call normahub_list_models with category=image."
    );
  }

  const size = optionalEnum(args, "size", SIZES) ?? "1024x1024";
  const n = optionalNumber(args, "n", { min: 1, max: 4 }) ?? 1;

  const response = await apiClient.generateImage(prompt, model.id, { size, n });

  const items = response?.data ?? [];
  const price = model.pricing.imagePerGeneration;
  const costLine =
    price === null ? "" : `\nEstimated list cost: $${(price * n).toFixed(4)} USD for ${n} image(s).`;
  const caption = `Image generated — ${model.id}, ${size}, ${n} image(s).${costLine}`;

  if (items.length === 0) {
    return {
      content: [{ type: "text", text: `${caption}\nThe gateway returned no image data.` }],
      isError: true,
    };
  }

  const content: Array<Record<string, unknown>> = [{ type: "text", text: caption }];
  for (const item of items) {
    if (item.url) {
      content.push({ type: "text", text: item.url });
    } else if (item.b64_json) {
      content.push({ type: "image", data: item.b64_json, mimeType: "image/png" });
    }
  }

  return { content };
}