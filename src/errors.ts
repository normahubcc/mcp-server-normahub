/**
 * Typed errors.
 *
 * Before this file every failure was a bare `Error` whose message contained the
 * HTTP status, and callers matched on `message.includes("404")`. That breaks as
 * soon as an upstream error text happens to contain the digits, and it hides
 * auth failures behind "try another endpoint" fallbacks.
 */

export class NormaHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "NormaHubApiError";
  }

  /** Endpoint does not exist on this gateway — a fallback is legitimate. */
  get isMissingEndpoint(): boolean {
    return this.status === 404 || this.status === 405 || this.status === 501;
  }

  /** Key rejected — never retry another path, the key itself is the problem. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/** Bad or missing tool argument. Message is safe to show to the model. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}