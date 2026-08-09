/**
 * Safe click with scroll, retry, and logging.
 */

import type { Locator, Page } from "playwright";
import type { AutomationLogger } from "../logger.js";
import type { FieldTarget } from "../types.js";
import { findElement, scrollIntoView } from "./selectors.js";
import { retry } from "./retry.js";
import { waitForReact } from "./wait.js";

export async function safeClick(
  page: Page,
  target: FieldTarget | Locator,
  options: {
    retries?: number;
    timeoutMs?: number;
    logger?: AutomationLogger;
    waitAfter?: boolean;
  } = {},
): Promise<void> {
  const logger = options.logger;

  await retry(
    async () => {
      const locator =
        "click" in target && typeof (target as Locator).click === "function"
          ? (target as Locator)
          : await findElement(page, target as FieldTarget, {
              timeoutMs: options.timeoutMs,
              logger,
              retries: 1,
            });

      await scrollIntoView(locator, logger);
      await locator.click({ timeout: options.timeoutMs ?? 8_000 });
      logger?.info("Clicked element", {
        hint:
          "selector" in (target as FieldTarget)
            ? (target as FieldTarget).selector ?? (target as FieldTarget).label
            : "locator",
      });

      if (options.waitAfter !== false) {
        await waitForReact(page, { logger, settleMs: 250 }).catch(() => undefined);
      }
    },
    {
      retries: options.retries ?? 3,
      label: "safeClick",
      logger,
    },
  );
}
