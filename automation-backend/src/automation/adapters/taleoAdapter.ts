import { BaseAtsAdapter } from "./baseAdapter.js";

export class TaleoAdapter extends BaseAtsAdapter {
  readonly id = "taleo" as const;

  matches(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host.includes("taleo.net") || host.includes("taleo.com");
    } catch {
      return /taleo/i.test(url);
    }
  }
}

export const taleoAdapter = new TaleoAdapter();
