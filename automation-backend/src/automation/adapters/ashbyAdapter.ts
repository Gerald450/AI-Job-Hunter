import { BaseAtsAdapter } from "./baseAdapter.js";

export class AshbyAdapter extends BaseAtsAdapter {
  readonly id = "ashby" as const;

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase().includes("ashbyhq.com");
    } catch {
      return /ashby/i.test(url);
    }
  }
}

export const ashbyAdapter = new AshbyAdapter();
