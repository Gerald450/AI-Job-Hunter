/**
 * Safe fill for inputs, textareas, contenteditable, and custom comboboxes.
 */

import type { Locator, Page } from "playwright";
import type { AutomationLogger } from "../logger.js";
import type { FieldTarget } from "../types.js";
import { findElement, scrollIntoView } from "./selectors.js";
import { retry } from "./retry.js";

function toStringValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export async function safeFill(
  page: Page,
  target: FieldTarget,
  value: string | number | boolean,
  options: {
    retries?: number;
    timeoutMs?: number;
    logger?: AutomationLogger;
    clear?: boolean;
  } = {},
): Promise<void> {
  const logger = options.logger;
  const text = toStringValue(value);
  const label =
    target.label ?? target.canonicalKey ?? target.selector ?? target.name ?? "field";

  await retry(
    async () => {
      const locator = await findElement(page, target, {
        timeoutMs: options.timeoutMs,
        logger,
        retries: 1,
      });
      await scrollIntoView(locator, logger);

      const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
      const role = await locator.getAttribute("role");
      const type = (await locator.getAttribute("type"))?.toLowerCase() ?? "";

      if (tag === "select") {
        try {
          await locator.selectOption({ label: text });
        } catch {
          await locator.selectOption({ value: text });
        }
      } else if (role === "combobox" || type === "combobox" || target.type === "combobox") {
        await fillCombobox(page, locator, text, logger);
      } else if (tag === "input" && (type === "checkbox" || type === "radio")) {
        const textLower = text.toLowerCase();
        const checked = ["yes", "true", "1", "y", "on"].includes(textLower);
        if (type === "radio") {
          // Prefer matching a radio option by visible label / value
          const radios = page.locator(
            `input[type="radio"][name="${await locator.getAttribute("name")}"]`,
          );
          const count = await radios.count();
          let clicked = false;
          for (let i = 0; i < count; i++) {
            const radio = radios.nth(i);
            const label = await radio.evaluate((el) => {
              const input = el as HTMLInputElement;
              const id = input.id;
              if (id) {
                const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                if (byFor?.textContent) return byFor.textContent.trim();
              }
              const wrap = input.closest("label");
              if (wrap) {
                const clone = wrap.cloneNode(true) as HTMLElement;
                clone.querySelectorAll("input").forEach((n) => n.remove());
                return (clone.textContent || "").trim();
              }
              return input.value;
            });
            const val = (await radio.getAttribute("value")) || "";
            const hay = `${label} ${val}`.toLowerCase();
            if (
              hay.includes(textLower) ||
              textLower.includes(label.toLowerCase()) ||
              (checked && /\byes\b|\btrue\b|^1$/.test(hay)) ||
              (!checked && /\bno\b|\bfalse\b|^0$/.test(hay))
            ) {
              await radio.check({ force: true });
              clicked = true;
              break;
            }
          }
          if (!clicked) {
            if (checked) await locator.check({ force: true });
            else await locator.uncheck({ force: true }).catch(() => undefined);
          }
        } else if (checked) {
          await locator.check({ force: true });
        } else {
          await locator.uncheck({ force: true }).catch(() => undefined);
        }
      } else {
        if (options.clear !== false) {
          await locator.fill("");
        }
        await locator.fill(text);
        // Fire React-friendly events for stubborn controlled inputs
        await locator.evaluate((el, v) => {
          const input = el as HTMLInputElement | HTMLTextAreaElement;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("blur", { bubbles: true }));
          void v;
        }, text);
      }

      logger?.info(`Filled ${label}`, { value: text.slice(0, 80) });
    },
    {
      retries: options.retries ?? 3,
      label: `safeFill(${label})`,
      logger,
    },
  );
}

async function fillCombobox(
  page: Page,
  locator: Locator,
  text: string,
  logger?: AutomationLogger,
): Promise<void> {
  await locator.click();
  await locator.fill(text).catch(async () => {
    await page.keyboard.type(text, { delay: 20 });
  });
  // Prefer exact option match when a listbox appears
  const option = page.getByRole("option", { name: text, exact: false }).first();
  if (await option.isVisible().catch(() => false)) {
    await option.click();
  } else {
    await page.keyboard.press("Enter");
  }
  logger?.debug("Filled combobox", { text });
}
