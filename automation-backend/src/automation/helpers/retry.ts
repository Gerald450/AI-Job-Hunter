/**
 * Retry helper with exponential backoff and structured logging.
 */

import type { AutomationLogger } from "../logger.js";

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  label?: string;
  logger?: AutomationLogger;
  /** Return true to retry; false to stop early. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries =
    options.retries ??
    (Number(process.env.DEFAULT_RETRIES) || 3);
  const delayMs = options.delayMs ?? 350;
  const label = options.label ?? "operation";
  const logger = options.logger;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const retryable = options.shouldRetry?.(err, attempt) ?? true;
      logger?.warn(`${label} failed (attempt ${attempt}/${retries})`, {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!retryable || attempt >= retries) break;
      await sleep(delayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed: ${String(lastError)}`);
}
