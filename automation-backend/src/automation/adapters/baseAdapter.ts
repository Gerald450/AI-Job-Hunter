/**
 * Shared adapter utilities — fill from profile + field targets, generic next/submit.
 */

import type { Page } from "playwright";
import { safeClick, safeFill, safeUpload, waitForReact } from "../helpers/index.js";
import type { AutomationLogger } from "../logger.js";
import type { FieldTarget, UserProfile } from "../types.js";
import {
  PROFILE_FIELD_MAP,
  type AdapterContext,
  type AtsAdapter,
  type ExtractedQuestion,
} from "./types.js";

export abstract class BaseAtsAdapter implements AtsAdapter {
  abstract readonly id: AtsAdapter["id"];
  abstract matches(url: string): boolean;

  async fill(ctx: AdapterContext): Promise<{ filled: string[] }> {
    const filled: string[] = [];
    const logger = ctx.logger;

    // Explicit field targets from the extension take priority
    if (ctx.fields?.length) {
      for (const field of ctx.fields) {
        if (field.value === undefined || field.value === null || field.value === "") {
          continue;
        }
        try {
          await safeFill(ctx.page, field, field.value, { logger });
          filled.push(field.canonicalKey || field.label || field.selector || "field");
        } catch (err) {
          logger.warn("Field fill skipped", {
            field: field.label || field.canonicalKey,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Profile-driven fallback for common contact fields
    if (ctx.profile) {
      const fromProfile = await this.fillFromProfile(ctx.page, ctx.profile, logger);
      filled.push(...fromProfile);
    }

    return { filled: [...new Set(filled)] };
  }

  protected async fillFromProfile(
    page: Page,
    profile: UserProfile,
    logger: AutomationLogger,
  ): Promise<string[]> {
    const filled: string[] = [];
    for (const entry of PROFILE_FIELD_MAP) {
      const value = entry.get(profile);
      if (value === undefined || value === null || value === "") continue;
      for (const key of entry.keys) {
        const targets: FieldTarget[] = [
          { canonicalKey: key, label: key.replace(/_/g, " ") },
        ];
        for (const target of targets) {
          try {
            await safeFill(page, target, value, { logger, retries: 1, timeoutMs: 2_500 });
            filled.push(key);
            break;
          } catch {
            /* try next key synonym */
          }
        }
        if (filled.includes(entry.keys[0]!)) break;
      }
    }
    return filled;
  }

  async clickNext(ctx: AdapterContext): Promise<void> {
    const labels = [/continue/i, /next/i, /save and continue/i, /save & continue/i];
    for (const re of labels) {
      const btn = ctx.page.getByRole("button", { name: re }).first();
      if (await btn.isVisible().catch(() => false)) {
        await safeClick(ctx.page, btn, { logger: ctx.logger });
        ctx.logger.info("Clicked Continue");
        return;
      }
    }
    // Fallback: submit-looking buttons that advance wizards
    const fallback = ctx.page.locator(
      'button[data-automation-id="bottom-navigation-next-button"], button[type="submit"]',
    ).first();
    await safeClick(ctx.page, fallback, { logger: ctx.logger });
    ctx.logger.info("Clicked Continue");
  }

  async submit(ctx: AdapterContext): Promise<void> {
    const labels = [/submit application/i, /submit/i, /apply/i, /send application/i];
    for (const re of labels) {
      const btn = ctx.page.getByRole("button", { name: re }).first();
      if (await btn.isVisible().catch(() => false)) {
        await safeClick(ctx.page, btn, { logger: ctx.logger, waitAfter: true });
        ctx.logger.info("Submitted application");
        return;
      }
    }
    throw new Error("Submit button not found");
  }

  async uploadResume(ctx: AdapterContext): Promise<void> {
    await safeUpload(
      ctx.page,
      { type: "file", label: "resume", canonicalKey: "resume" },
      {
        path: ctx.resumePath,
        base64: ctx.resumeBase64,
        filename: ctx.resumeFilename,
        mimeType: ctx.resumeMimeType,
      },
      { logger: ctx.logger },
    );
    await waitForReact(ctx.page, { logger: ctx.logger, settleMs: 500 });
  }

  async extractQuestions(ctx: AdapterContext): Promise<ExtractedQuestion[]> {
    return ctx.page.evaluate(() => {
      const results: Array<{
        label: string;
        type?: string;
        required?: boolean;
        options?: string[];
        selector?: string;
      }> = [];
      const controls = document.querySelectorAll(
        "input:not([type=hidden]), textarea, select, [role=combobox]",
      );
      controls.forEach((el, index) => {
        const input = el as HTMLInputElement;
        const id = input.id;
        let label = "";
        if (id) {
          label = document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? "";
        }
        if (!label) {
          label =
            input.getAttribute("aria-label") ||
            input.placeholder ||
            input.name ||
            `field_${index}`;
        }
        const options =
          el.tagName === "SELECT"
            ? Array.from((el as HTMLSelectElement).options).map((o) => o.text)
            : undefined;
        results.push({
          label: label.trim().replace(/\s+/g, " ").slice(0, 200),
          type: input.type || el.tagName.toLowerCase(),
          required: input.required || input.getAttribute("aria-required") === "true",
          options,
          selector: id ? `#${CSS.escape(id)}` : undefined,
        });
      });
      return results;
    });
  }
}
