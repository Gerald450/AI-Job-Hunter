import { BaseAtsAdapter } from "./baseAdapter.js";
import type { AdapterContext } from "./types.js";
import { safeClick } from "../helpers/index.js";

export class LeverAdapter extends BaseAtsAdapter {
  readonly id = "lever" as const;

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase().includes("lever.co");
    } catch {
      return /lever\.co/i.test(url);
    }
  }

  override async submit(ctx: AdapterContext): Promise<void> {
    const btn = ctx.page.locator(
      'button[type="submit"], .template-btn-submit, button:has-text("Submit application")',
    ).first();
    if (await btn.isVisible().catch(() => false)) {
      await safeClick(ctx.page, btn, { logger: ctx.logger });
      ctx.logger.info("Submitted application");
      return;
    }
    await super.submit(ctx);
  }
}

export const leverAdapter = new LeverAdapter();
