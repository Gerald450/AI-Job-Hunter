import { BaseAtsAdapter } from "./baseAdapter.js";

export class OracleAdapter extends BaseAtsAdapter {
  readonly id = "oracle" as const;

  matches(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host.includes("oraclecloud.com") || host.includes("recruiting.oracle");
    } catch {
      return /oracle/i.test(url);
    }
  }
}

export const oracleAdapter = new OracleAdapter();
