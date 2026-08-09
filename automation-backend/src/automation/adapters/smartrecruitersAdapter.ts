import { BaseAtsAdapter } from "./baseAdapter.js";

export class SmartRecruitersAdapter extends BaseAtsAdapter {
  readonly id = "smartrecruiters" as const;

  matches(url: string): boolean {
    try {
      return new URL(url).hostname.toLowerCase().includes("smartrecruiters.com");
    } catch {
      return /smartrecruiters/i.test(url);
    }
  }
}

export const smartRecruitersAdapter = new SmartRecruitersAdapter();
