/**
 * Small argument readers for MCP tool input.
 *
 * Models routinely send numbers as strings, omit defaults, or pass an empty
 * string where a value is required. Unvalidated `args.x || default` silently
 * turns those into paid API calls with wrong parameters, so every tool now goes
 * through these readers and fails with a message the model can act on.
 */

import { ToolInputError } from "./errors.js";

export type ToolArgs = Record<string, unknown>;

function asObject(args: unknown): ToolArgs {
  return typeof args === "object" && args !== null ? (args as ToolArgs) : {};
}

export function optionalString(args: unknown, key: string): string | undefined {
  const value = asObject(args)[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    throw new ToolInputError(`Argument "${key}" must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function requiredString(args: unknown, key: string): string {
  const value = optionalString(args, key);
  if (value === undefined) {
    throw new ToolInputError(`Argument "${key}" is required and must be a non-empty string.`);
  }
  return value;
}

export function optionalNumber(
  args: unknown,
  key: string,
  bounds: { min?: number; max?: number } = {}
): number | undefined {
  const raw = asObject(args)[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new ToolInputError(`Argument "${key}" must be a finite number, got ${JSON.stringify(raw)}.`);
  }
  if (bounds.min !== undefined && value < bounds.min) {
    throw new ToolInputError(`Argument "${key}" must be >= ${bounds.min}, got ${value}.`);
  }
  if (bounds.max !== undefined && value > bounds.max) {
    throw new ToolInputError(`Argument "${key}" must be <= ${bounds.max}, got ${value}.`);
  }
  return value;
}

export function optionalEnum<T extends string>(
  args: unknown,
  key: string,
  allowed: readonly T[]
): T | undefined {
  const value = optionalString(args, key);
  if (value === undefined) return undefined;
  const match = allowed.find((item) => item === value);
  if (!match) {
    throw new ToolInputError(
      `Argument "${key}" must be one of: ${allowed.join(", ")} — got "${value}".`
    );
  }
  return match;
}

export function optionalStringArray(args: unknown, key: string): string[] | undefined {
  const raw = asObject(args)[key];
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new ToolInputError(`Argument "${key}" must be an array of strings.`);
  }
  return raw
    .filter((item) => typeof item === "string" && item.trim() !== "")
    .map((item) => (item as string).trim());
}

export interface ParsedMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Validates a chat history array element by element instead of trusting it. */
export function optionalMessages(args: unknown, key = "messages"): ParsedMessage[] | undefined {
  const raw = asObject(args)[key];
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ToolInputError(`Argument "${key}" must be a non-empty array of {role, content}.`);
  }
  const roles = ["system", "user", "assistant"] as const;
  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new ToolInputError(`Argument "${key}[${index}]" must be an object with role and content.`);
    }
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (typeof role !== "string" || !roles.includes(role as (typeof roles)[number])) {
      throw new ToolInputError(
        `Argument "${key}[${index}].role" must be one of: ${roles.join(", ")}.`
      );
    }
    if (typeof content !== "string") {
      throw new ToolInputError(`Argument "${key}[${index}].content" must be a string.`);
    }
    return { role: role as ParsedMessage["role"], content };
  });
}