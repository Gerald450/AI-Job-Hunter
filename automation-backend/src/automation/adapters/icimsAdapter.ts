import { BaseAtsAdapter } from "./baseAdapter.js";

export class IcimsAdapter extends BaseAtsAdapter {
  readonly id = "icims" as const;

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase().includes("icims.com");
    } catch {
      return /icims/i.test(url);
    }
  }
}

export const icimsAdapter = new IcimsAdapter();
