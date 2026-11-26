/**
 * MCP tool: audio transcription (Whisper).
 *
 * Two real limits are enforced here instead of at the provider: the 25 MB
 * request cap and the download size, because an agent happily passes a two-hour
 * podcast and the failure then costs a round trip (and sometimes money).
 */

import fs from "node:fs";
import path from "node:path";
import { apiClient } from "../client.js";
import { ToolInputError } from "../errors.js";
import { optionalString } from "../args.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export const AUDIO_TOOL_DEFINITION = {
  name: "normahub_transcribe_audio",
  description:
    "Transcribe an audio file (voice note, call recording, video soundtrack) to text with Whisper through NormaHub. " +
    "Accepts a local path readable by this server or a public URL; files up to 25 MB.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to a local audio file (.mp3, .wav, .m4a, .ogg, .flac, .mp4, .webm).",
      },
      url: { type: "string", description: "Public http(s) URL of the audio file, used when file_path is omitted." },
      model: { type: "string", description: "Whisper model id (default whisper-1)." },
      language: { type: "string", description: "ISO-639-1 language code such as ru or en; auto-detected when omitted." },
      prompt: { type: "string", description: "Vocabulary hints or names to improve recognition of domain terms." },
    },
  },
};

function assertSize(bytes: number, source: string): void {
  if (bytes === 0) throw new ToolInputError(`Audio from ${source} is empty.`);
  if (bytes > MAX_AUDIO_BYTES) {
    throw new ToolInputError(
      `Audio from ${source} is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the 25 MB limit. ` +
        "Split it or compress it before transcribing."
    );
  }
}

async function readLocal(filePath: string): Promise<{ buffer: Buffer; filename: string }> {
  const resolved = path.resolve(filePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new ToolInputError(`Audio file not found: ${filePath}`);
  }
  if (!stat.isFile()) throw new ToolInputError(`Not a regular file: ${filePath}`);
  assertSize(stat.size, filePath);
  return { buffer: fs.readFileSync(resolved), filename: path.basename(resolved) };
}

async function download(url: string): Promise<{ buffer: Buffer; filename: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ToolInputError(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ToolInputError("Only http(s) URLs are supported for remote audio.");
  }

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Downloading ${url} failed with HTTP ${response.status}.`);
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_AUDIO_BYTES) assertSize(declared, url);

  const buffer = Buffer.from(await response.arrayBuffer());
  assertSize(buffer.length, url);
  const filename =
    path.basename(parsed.pathname) ||
    (response.headers.get("content-type")?.includes("wav") ? "audio.wav" : "audio.mp3");
  return { buffer, filename };
}

export async function handleAudioTool(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const filePath = optionalString(args, "file_path");
  const url = optionalString(args, "url");
  const model = optionalString(args, "model") ?? "whisper-1";
  const language = optionalString(args, "language");
  const prompt = optionalString(args, "prompt");

  if (!filePath && !url) {
    throw new ToolInputError("Provide 'file_path' or 'url'.");
  }

  const source = filePath ? await readLocal(filePath) : await download(url as string);
  const result = await apiClient.transcribeAudio(source.buffer, source.filename, {
    model,
    language,
    prompt,
  });

  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (!text) {
    return {
      content: [
        {
          type: "text",
          text: `Transcription of ${source.filename} returned no text. The file may contain no speech or be unsupported.`,
        },
      ],
    };
  }

  const meta = [
    `file: ${source.filename}`,
    `model: ${model}`,
    typeof result.language === "string" ? `language: ${result.language}` : null,
    `${text.split(/\s+/).length} words`,
  ]
    .filter((line): line is string => line !== null)
    .join(" | ");

  return { content: [{ type: "text", text: `[${meta}]\n\n${text}` }] };
}