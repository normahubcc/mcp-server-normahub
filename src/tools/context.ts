/**
 * Narrow view of the per-request context the MCP SDK passes to a tool handler.
 *
 * Long-running tools (video render can take minutes) use it to emit
 * `notifications/progress` and to stop polling when the client cancels.
 */

export interface ToolContext {
  signal?: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification?: (notification: {
    method: string;
    params?: Record<string, unknown>;
  }) => Promise<void>;
}

export async function reportProgress(
  context: ToolContext | undefined,
  progress: number,
  total: number,
  message: string
): Promise<void> {
  const token = context?._meta?.progressToken;
  if (token === undefined || !context?.sendNotification) return;
  try {
    await context.sendNotification({
      method: "notifications/progress",
      params: { progressToken: token, progress, total, message },
    });
  } catch {
    // A client that does not listen for progress must not break the render.
  }
}

export function throwIfAborted(context: ToolContext | undefined): void {
  if (context?.signal?.aborted) {
    const reason = context.signal.reason;
    throw new Error(
      `Request cancelled by the client${reason instanceof Error ? `: ${reason.message}` : ""}. ` +
        "Any started generation continues on the gateway; check usage before retrying."
    );
  }
}