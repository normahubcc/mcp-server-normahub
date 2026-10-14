/**
 * MCP Tool: transcribe_audio
 * Transcribes audio and voice notes using Whisper via NormaHub API.
 */

import fs from "fs";
import path from "path";
import { apiClient } from "../client.js";

export const AUDIO_TOOL_DEFINITION = {
  name: "normahub_transcribe_audio",
  description: "Transcribe audio recordings, voice notes, and video soundtracks to text using OpenAI Whisper via NormaHub API without VPN. Accepts local file path or public HTTP URL.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Absolute or relative path to local audio file (.mp3, .wav, .m4a, .ogg, .oga, .mp4)",
      },
      url: {
        type: "string",
        description: "Public HTTP/HTTPS URL of the audio file (used if file_path is omitted)",
      },
      model: {
        type: "string",
        description: "Whisper model ID to use (default: whisper-1)",
        default: "whisper-1",
      },
      language: {
        type: "string",
        description: "Two-letter ISO language code (e.g. 'ru' for Russian, 'en' for English). Optional, auto-detected if omitted.",
      },
      prompt: {
        type: "string",
        description: "Optional context prompt or dictionary hints to improve transcription accuracy of domain terms.",
      },
    },
  },
};

export async function handleAudioTool(args: any): Promise<any> {
  const model = args.model || "whisper-1";
  let buffer: Buffer;
  let filename = "audio.mp3";

  if (args.file_path) {
    const resolvedPath = path.resolve(args.file_path);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Audio file not found at path: ${args.file_path}`);
    }
    buffer = fs.readFileSync(resolvedPath);
    filename = path.basename(resolvedPath);
  } else if (args.url) {
    const resp = await fetch(args.url);
    if (!resp.ok) {
      throw new Error(`Failed to download audio from URL: ${args.url} (HTTP ${resp.status})`);
    }
    const arrBuf = await resp.arrayBuffer();
    buffer = Buffer.from(arrBuf);
    filename = path.basename(new URL(args.url).pathname) || "downloaded_audio.mp3";
  } else {
    throw new Error("Either 'file_path' or 'url' must be provided for audio transcription.");
  }

  const result = await apiClient.transcribeAudio(
    buffer,
    filename,
    model,
    args.language,
    args.prompt
  );

  const text = result?.text || "";
  const detectedLang = result?.language ? ` (Language: ${result.language})` : "";

  return {
    content: [
      {
        type: "text",
        text: `🎙️ Transcription Result${detectedLang}:\n\n${text}`,
      },
    ],
  };
}
