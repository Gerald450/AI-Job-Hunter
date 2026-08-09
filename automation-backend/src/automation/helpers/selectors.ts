/**
 * Element location helpers: CSS, label, placeholder, role, text.
 * Prefer Playwright locators; fall back to page.evaluate for edge cases.
 */

import type { Locator, Page } from "playwright";
import type { AutomationLogger } from "../logger.js";
import type { FieldTarget } from "../types.js";
import { retry } from "./retry.js";

export interface FindOptions {
  timeoutMs?: number;
  retries?: number;
  logger?: AutomationLogger;
  visible?: boolean;
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/** Build a locator from a FieldTarget using the most specific available signal. */
export function locatorFromTarget(page: Page, target: FieldTarget): Locator {
  if (target.selector) {
    return page.locator(target.selector).first();
  }
  if (target.id) {
    return page.locator(`#${cssEscape(target.id)}`).first();
  }
  if (target.name) {
    return page.locator(`[name="${cssEscapeAttr(target.name)}"]`).first();
  }
  if (target.label) {
    return page.getByLabel(target.label, { exact: false }).first();
  }
  if (target.placeholder) {
    return page.getByPlaceholder(target.placeholder, { exact: false }).first();
  }
  if (target.role && target.text) {
    return page.getByRole(target.role as "button", { name: target.text }).first();
  }
  if (target.text) {
    return page.getByText(target.text, { exact: false }).first();
  }
  throw new Error("FieldTarget has no usable locator hints");
}

export async function findElement(
  page: Page,
  target: FieldTarget,
  options: FindOptions = {},
): Promise<Locator> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const logger = options.logger;
  const label = firstDefined(
    target.label,
    target.canonicalKey,
    target.selector,
    target.name,
    target.id,
    "element",
  );

  return retry(
    async () => {
      const locator = locatorFromTarget(page, target);
      await locator.waitFor({
        state: options.visible === false ? "attached" : "visible",
        timeout: timeoutMs,
      });
      logger?.info(`Found element`, { label, selector: target.selector });
      return locator;
    },
    {
      retries: options.retries ?? 3,
      label: `findElement(${label})`,
      logger,
    },
  );
}

export async function findByLabel(
  page: Page,
  label: string,
  options: FindOptions = {},
): Promise<Locator> {
  return findElement(page, { label }, options);
}

export async function findByPlaceholder(
  page: Page,
  placeholder: string,
  options: FindOptions = {},
): Promise<Locator> {
  return findElement(page, { placeholder }, options);
}

export async function findByRole(
  page: Page,
  role: string,
  name?: string,
  options: FindOptions = {},
): Promise<Locator> {
  return findElement(page, { role, text: name }, options);
}

export async function findByText(
  page: Page,
  text: string,
  options: FindOptions = {},
): Promise<Locator> {
  return findElement(page, { text }, options);
}

export async function scrollIntoView(
  locator: Locator,
  logger?: AutomationLogger,
): Promise<void> {
  await retry(
    async () => {
      await locator.scrollIntoViewIfNeeded();
      logger?.debug("Scrolled element into view");
    },
    { retries: 2, label: "scrollIntoView", logger },
  );
}

function cssEscape(value: string): string {
  // Minimal CSS.escape for simple ids
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function cssEscapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
