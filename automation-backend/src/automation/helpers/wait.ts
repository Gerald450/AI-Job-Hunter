/**
 * Wait helpers for React SPAs, network idle, and navigation.
 */

import type { Page } from "playwright";
import type { AutomationLogger } from "../logger.js";
import { retry } from "./retry.js";

export async function waitForNetworkIdle(
  page: Page,
  options: { timeoutMs?: number; logger?: AutomationLogger } = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 15_000;
  options.logger?.info("Waiting for network idle");
  await retry(
    async () => {
      await page.waitForLoadState("networkidle", { timeout });
    },
    {
      retries: 2,
      label: "waitForNetworkIdle",
      logger: options.logger,
      shouldRetry: (err) =>
        !(err instanceof Error && /Target closed|Session closed/i.test(err.message)),
    },
  );
}

export async function waitForNavigation(
  page: Page,
  options: {
    timeoutMs?: number;
    url?: string | RegExp;
    logger?: AutomationLogger;
  } = {},
): Promise<void> {
  options.logger?.info("Waiting for navigation", { url: options.url?.toString() });
  await page.waitForURL(options.url ?? (url => url.href !== "about:blank"), {
    timeout: options.timeoutMs ?? 20_000,
    waitUntil: "domcontentloaded",
  });
}

/**
 * Heuristic wait for React / SPA settle:
 * - document ready
 * - short network quiet period
 * - optional selector to appear
 */
export async function waitForReact(
  page: Page,
  options: {
    timeoutMs?: number;
    settleMs?: number;
    selector?: string;
    logger?: AutomationLogger;
  } = {},
): Promise<void> {
  const logger = options.logger;
  logger?.info("Waiting for React");
  const timeout = options.timeoutMs ?? 12_000;
  const settleMs = options.settleMs ?? 400;

  await retry(
    async () => {
      await page.waitForLoadState("domcontentloaded", { timeout });
      if (options.selector) {
        await page.locator(options.selector).first().waitFor({
          state: "visible",
          timeout,
        });
      }
      // Quiet window — React often finishes hydration after DOMContentLoaded.
      await page.waitForTimeout(settleMs);
      try {
        await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 5_000) });
      } catch {
        // networkidle is best-effort on chatty SPAs
        logger?.debug("networkidle skipped during waitForReact");
      }
    },
    { retries: 2, label: "waitForReact", logger },
  );
}
