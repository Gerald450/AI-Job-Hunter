import { BaseAtsAdapter } from "./baseAdapter.js";
import type { AdapterContext } from "./types.js";
import { safeClick, waitForReact } from "../helpers/index.js";

/**
 * Workday multi-step application adapter.
 * Uses data-automation-id hooks when present; falls back to role/label.
 */
export class WorkdayAdapter extends BaseAtsAdapter {
  readonly id = "workday" as const;

  matches(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return (
        host.includes("myworkdayjobs.com") ||
        host.includes("workdayjobs.com") ||
        /\.wd\d+\./i.test(host)
      );
    } catch {
      return /workday/i.test(url);
    }
  }

  override async clickNext(ctx: AdapterContext): Promise<void> {
    const next = ctx.page.locator(
      '[data-automation-id="bottom-navigation-next-button"], button[data-automation-id="pageFooterNextButton"]',
    ).first();
    if (await next.isVisible().catch(() => false)) {
      await safeClick(ctx.page, next, { logger: ctx.logger });
      ctx.logger.info("Clicked Continue");
      await waitForReact(ctx.page, {
        logger: ctx.logger,
        selector: "[data-automation-id]",
      });
      return;
    }
    await super.clickNext(ctx);
  }

  override async submit(ctx: AdapterContext): Promise<void> {
    const submit = ctx.page.locator(
      '[data-automation-id="pageFooterNextButton"], button:has-text("Submit")',
    ).first();
    if (await submit.isVisible().catch(() => false)) {
      await safeClick(ctx.page, submit, { logger: ctx.logger });
      ctx.logger.info("Submitted application");
      return;
    }
    await super.submit(ctx);
  }

  override async uploadResume(ctx: AdapterContext): Promise<void> {
    // Workday often hides the native input; setInputFiles still works when attached.
    const fileInput = ctx.page.locator(
      'input[type="file"][data-automation-id], input[type="file"]',
    ).first();
    if (await fileInput.count()) {
      const { safeUpload } = await import("../helpers/index.js");
      await safeUpload(
        ctx.page,
        undefined,
        {
          path: ctx.resumePath,
          base64: ctx.resumeBase64,
          filename: ctx.resumeFilename,
          mimeType: ctx.resumeMimeType,
        },
        { logger: ctx.logger },
      );
      ctx.logger.info("Uploaded Resume");
      return;
    }
    await super.uploadResume(ctx);
  }
}

export const workdayAdapter = new WorkdayAdapter();
