/**
 * MCP Tool: generate_video
 * Generates videos using SeeDance 2.5 / 2.0 or Grok Video.
 */

import { apiClient } from "../client.js";

export const VIDEO_TOOL_DEFINITION = {
  name: "normahub_generate_video",
  description: "Generate AI videos using SeeDance 2.5 / 2.0 and xAI Grok Imagine Video via NormaHub API. Automatically polls until video render completes.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Text prompt describing the desired video scene and motion",
      },
      model: {
        type: "string",
        description: "Video model to use (seedance-2.5, seedance-2.0, grok-imagine-video-1.5)",
        default: "seedance-2.5",
      },
    },
    required: ["prompt"],
  },
};

export async function handleVideoTool(args: any): Promise<any> {
  const model = args.model || "seedance-2.5";
  const initialTask = await apiClient.createVideoTask(args.prompt, model);

  // Poll until done
  const completedTask = await apiClient.pollVideoUntilDone(initialTask.id, 180_000);

  if (completedTask.status === "failed") {
    throw new Error(`Video generation failed: ${completedTask.error || "Unknown error"}`);
  }

  return {
    content: [
      {
        type: "text",
        text: `Video generated with ${model}:\n\nTask ID: ${completedTask.id}\nDownload MP4: ${completedTask.video_url}`,
      },
    ],
  };
}

export const IMAGE_TO_VIDEO_TOOL_DEFINITION = {
  name: "normahub_image_to_video",
  description: "Animate an input image into a video (Image-to-Video) using SeeDance 2.5 / 2.0 via NormaHub API. Accepts image URL and animation prompt. Automatically polls until video render completes.",
  inputSchema: {
    type: "object",
    properties: {
      image_url: {
        type: "string",
        description: "Direct HTTP/HTTPS URL or data URI of the input image to animate",
      },
      prompt: {
        type: "string",
        description: "Motion direction and cinematic animation instructions for the image",
      },
      model: {
        type: "string",
        description: "Video model to use (seedance-2.5, seedance-2.0, grok-imagine-video-1.5)",
        default: "seedance-2.5",
      },
    },
    required: ["image_url", "prompt"],
  },
};

export async function handleImageToVideoTool(args: any): Promise<any> {
  if (!args.image_url) {
    throw new Error("Missing required parameter 'image_url' for Image-to-Video generation.");
  }
  if (!args.prompt) {
    throw new Error("Missing required parameter 'prompt' for Image-to-Video generation.");
  }

  const model = args.model || "seedance-2.5";
  const initialTask = await apiClient.createImageToVideoTask(args.image_url, args.prompt, model);

  // Poll until done
  const completedTask = await apiClient.pollVideoUntilDone(initialTask.id, 180_000);

  if (completedTask.status === "failed") {
    throw new Error(`Image-to-Video generation failed: ${completedTask.error || "Unknown error"}`);
  }

  return {
    content: [
      {
        type: "text",
        text: `Image-to-Video generated with ${model}:\n\nInput Image: ${args.image_url}\nTask ID: ${completedTask.id}\nDownload MP4: ${completedTask.video_url}`,
      },
    ],
  };
}

