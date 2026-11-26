/**
 * MCP tools: video generation (text-to-video and image-to-video).
 *
 * Two things changed after the catalog moved to the live endpoint:
 *  - the bundled default `seedance-2.5` is no longer offered by the gateway, so
 *    the default is resolved from the live catalog instead of a stale constant;
 *  - every generation now reports the estimated USD cost before/with the result,
 *    because a video render is the most expensive call in this server.
 */

import { apiClient } from "../client.js";
import {
  formatPrice,
  loadCatalog,
  requireModel,
  type CatalogModel,
  type VideoPrice,
} from "../catalog.js";
import { optionalEnum, optionalNumber, optionalString, requiredString } from "../args.js";
import { reportProgress, throwIfAborted, type ToolContext } from "./context.js";

const RESOLUTIONS = ["480p", "720p", "1080p", "4k"] as const;

export const VIDEO_TOOL_DEFINITION = {
  name: "normahub_generate_video",
  description:
    "Generate a video from a text prompt (text-to-video) with NormaHub (Grok Imagine Video and other video models). " +
    "Submits the task, polls until it finishes, reports progress and returns the MP4 URL with the estimated cost.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Scene description: subject, action, camera movement, lighting, style." },
      model: {
        type: "string",
        description: "Video model id from normahub_list_models. Default: the gateway's first video model.",
      },
      duration: { type: "number", description: "Clip length in seconds (provider limits apply, typically 2–10)." },
      aspect_ratio: {
        type: "string",
        description: "Frame ratio such as 16:9, 9:16 or 1:1. Provider support varies.",
      },
      resolution: { type: "string", enum: [...RESOLUTIONS], description: "Output resolution tier." },
      poll_timeout_seconds: {
        type: "number",
        description: "How long to wait for the render before returning the task id (default 240, max 900).",
      },
    },
    required: ["prompt"],
  },
};

export const IMAGE_TO_VIDEO_TOOL_DEFINITION = {
  name: "normahub_image_to_video",
  description:
    "Animate a still image into a video (image-to-video) with NormaHub video models. " +
    "Accepts a public image URL or data URI, polls the task and returns the MP4 URL with the estimated cost.",
  inputSchema: {
    type: "object",
    properties: {
      image_url: { type: "string", description: "Public HTTPS URL or data URI of the source image." },
      prompt: { type: "string", description: "Motion and camera instructions for the animation." },
      model: { type: "string", description: "Video model id from normahub_list_models." },
      duration: { type: "number", description: "Clip length in seconds." },
      aspect_ratio: { type: "string", description: "Frame ratio such as 16:9, 9:16 or 1:1." },
      resolution: { type: "string", enum: [...RESOLUTIONS], description: "Output resolution tier." },
      poll_timeout_seconds: {
        type: "number",
        description: "How long to wait for the render before returning the task id (default 240, max 900).",
      },
    },
    required: ["image_url", "prompt"],
  },
};

const ASPECT_RATIO = /^\d{1,2}:\d{1,2}$/;

async function resolveVideoModel(requested: string | undefined): Promise<CatalogModel> {
  const catalog = await loadCatalog();
  const candidate =
    requested ?? process.env.NORMAHUB_DEFAULT_VIDEO_MODEL?.trim() ?? undefined;

  if (candidate) return requireModel(catalog, candidate, "video");

  const videoModels = catalog.models.filter((m) => m.category === "video");
  if (videoModels.length === 0) {
    throw new Error(
      "The catalog reports no video models right now. Call normahub_list_models with category=video, " +
        "or pass an explicit model id."
    );
  }
  return videoModels[0];
}

function videoCost(
  model: CatalogModel,
  seconds: number | undefined,
  resolution: string
): string | null {
  if (seconds === undefined) return null;
  const table: VideoPrice = model.pricing.videoPerSecond;
  const rate = table[resolution as keyof VideoPrice] ?? table["720p"] ?? table["480p"];
  if (rate === null || rate === undefined) return null;
  return `~$${(rate * seconds).toFixed(4)} USD (${seconds}s at $${formatPrice(rate)}/sec, ${resolution})`;
}

interface VideoGenerationOptions {
  prompt: string;
  imageUrl?: string;
  args: unknown;
  context?: ToolContext;
}

async function generate(options: VideoGenerationOptions): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const model = await resolveVideoModel(optionalString(options.args, "model"));
  const duration = optionalNumber(options.args, "duration", { min: 1, max: 60 });
  const aspectRatio = optionalString(options.args, "aspect_ratio");
  if (aspectRatio && !ASPECT_RATIO.test(aspectRatio)) {
    throw new Error(`aspect_ratio must look like "16:9", got "${aspectRatio}".`);
  }
  const resolution = optionalEnum(options.args, "resolution", RESOLUTIONS) ?? "720p";
  const timeoutSeconds =
    optionalNumber(options.args, "poll_timeout_seconds", { min: 10, max: 900 }) ?? 240;

  throwIfAborted(options.context);

  const estimate = videoCost(model, duration, resolution);
  const task = options.imageUrl
    ? await apiClient.createImageToVideoTask(options.imageUrl, options.prompt, model.id, {
        durationSeconds: duration,
        aspectRatio,
        resolution,
      })
    : await apiClient.createVideoTask(options.prompt, model.id, {
        durationSeconds: duration,
        aspectRatio,
        resolution,
      });

  await reportProgress(options.context, 0, timeoutSeconds, `Task ${task.id} queued on ${model.id}`);

  const startedAt = Date.now();
  const completed = await apiClient.pollVideoUntilDone(task.id, {
    timeoutMs: timeoutSeconds * 1000,
    onPoll: async (current) => {
      throwIfAborted(options.context);
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      await reportProgress(
        options.context,
        Math.min(elapsed, timeoutSeconds),
        timeoutSeconds,
        `Task ${current.id}: ${current.status} (${elapsed}s elapsed)`
      );
    },
  });

  if (completed.status === "failed") {
    throw new Error(
      `Video generation failed on ${model.id} (task ${completed.id}): ${completed.error ?? "no reason given"}`
    );
  }

  const source = options.imageUrl ? `Input image: ${options.imageUrl}\n` : "";
  return {
    content: [
      {
        type: "text",
        text:
          `Video ready — ${model.id} (task ${completed.id})\n` +
          source +
          `\n${completed.video_url ?? "(the gateway returned no video_url — query the task id)"}\n\n` +
          (estimate ? `Estimated list cost: ${estimate}\n` : ""),
      },
    ],
  };
}

export async function handleVideoTool(
  args: unknown,
  context?: ToolContext
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const prompt = requiredString(args, "prompt");
  return generate({ prompt, args, context });
}

export async function handleImageToVideoTool(
  args: unknown,
  context?: ToolContext
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const imageUrl = requiredString(args, "image_url");
  if (!/^(https?:\/\/|data:image\/)/i.test(imageUrl)) {
    throw new Error("image_url must be an http(s) URL or a data:image/... URI.");
  }
  const prompt = requiredString(args, "prompt");
  return generate({ prompt, imageUrl, args, context });
}

/** Exported for tests: verifies the default resolves to a real catalog entry. */
export async function defaultVideoModelId(): Promise<string> {
  return (await resolveVideoModel(undefined)).id;
}