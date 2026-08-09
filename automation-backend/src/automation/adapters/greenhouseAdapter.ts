import { BaseAtsAdapter } from "./baseAdapter.js";
import type { AdapterContext } from "./types.js";
import { safeClick } from "../helpers/index.js";

export class GreenhouseAdapter extends BaseAtsAdapter {
  readonly id = "greenhouse" as const;

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase().includes("greenhouse.io");
    } catch {
      return /greenhouse/i.test(url);
    }
  }

  override async submit(ctx: AdapterContext): Promise<void> {
    const btn = ctx.page.locator(
      '#submit_app, button[type="submit"], input[type="submit"]',
    ).first();
    if (await btn.isVisible().catch(() => false)) {
      await safeClick(ctx.page, btn, { logger: ctx.logger });
      ctx.logger.info("Submitted application");
      return;
    }
    await super.submit(ctx);
  }

  override async uploadResume(ctx: AdapterContext): Promise<void> {
    const { safeUpload } = await import("../helpers/index.js");
    await safeUpload(
      ctx.page,
      { selector: 'input[type="file"][name*="resume"], #resume, input[type="file"]' },
      {
        path: ctx.resumePath,
        base64: ctx.resumeBase64,
        filename: ctx.resumeFilename,
        mimeType: ctx.resumeMimeType,
      },
      { logger: ctx.logger },
    );
    ctx.logger.info("Uploaded Resume");
  }
}

export const greenhouseAdapter = new GreenhouseAdapter();
