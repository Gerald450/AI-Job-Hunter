/**
 * ATS registry + auto-detection.
 * Register new adapters here — core orchestration stays unchanged.
 */

import type { AtsPlatform } from "../types.js";
import { ashbyAdapter } from "./ashbyAdapter.js";
import { greenhouseAdapter } from "./greenhouseAdapter.js";
import { icimsAdapter } from "./icimsAdapter.js";
import { leverAdapter } from "./leverAdapter.js";
import { oracleAdapter } from "./oracleAdapter.js";
import { smartRecruitersAdapter } from "./smartrecruitersAdapter.js";
import { taleoAdapter } from "./taleoAdapter.js";
import type { AtsAdapter } from "./types.js";
import { workdayAdapter } from "./workdayAdapter.js";
import { BaseAtsAdapter } from "./baseAdapter.js";

class UnknownAdapter extends BaseAtsAdapter {
  readonly id = "unknown" as const;
  matches(): boolean {
    return true;
  }
}

export const adapters: AtsAdapter[] = [
  workdayAdapter,
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  smartRecruitersAdapter,
  icimsAdapter,
  oracleAdapter,
  taleoAdapter,
];

const unknownAdapter = new UnknownAdapter();

export function detectAts(url: string, forced?: AtsPlatform): AtsAdapter {
  if (forced && forced !== "unknown") {
    const found = adapters.find((a) => a.id === forced);
    if (found) return found;
  }
  for (const adapter of adapters) {
    if (adapter.matches(url)) return adapter;
  }
  return unknownAdapter;
}

export type { AtsAdapter, AdapterContext, ExtractedQuestion } from "./types.js";
