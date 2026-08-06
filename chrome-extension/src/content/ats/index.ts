/**
 * ATS adapter registry.
 *
 * Architecture (generic-first):
 *
 *   detect ATS (optional)
 *        ↓
 *   run Generic Field Detection Engine   ← primary source of truth
 *        ↓
 *   adapter.enrichFields? (optional)
 *        ↓
 *   normalizeFields → common schema
 *
 * Adding a new ATS = implement AtsAdapter + register below.
 * Never modify the detector or autofill engine.
 */

import { ashbyAdapter } from "@/content/ats/ashby";
import { greenhouseAdapter } from "@/content/ats/greenhouse";
import { icimsAdapter } from "@/content/ats/icims";
import { leverAdapter } from "@/content/ats/lever";
import { oracleAdapter } from "@/content/ats/oracle";
import { smartrecruitersAdapter } from "@/content/ats/smartrecruiters";
import { successfactorsAdapter } from "@/content/ats/successfactors";
import { taleoAdapter } from "@/content/ats/taleo";
import { workdayAdapter } from "@/content/ats/workday";
import { workableAdapter } from "@/content/ats/workable";
import type { AtsAdapter } from "@/content/ats/types";
import { detectFields } from "@/content/detector";
import { normalizeFields } from "@/content/normalize";
import { logger } from "@/lib/logger";
import type { AtsProvider, DetectedField, JobExtraction } from "@/types";

export type { AtsAdapter };

const SCOPE = "ats";

/** Ordered list — more specific hosts should come before generic ones. */
const ADAPTERS: AtsAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  workableAdapter,
  workdayAdapter,
  smartrecruitersAdapter,
  icimsAdapter,
  oracleAdapter,
  taleoAdapter,
  successfactorsAdapter,
];

export function detectAts(
  hostname = window.location.hostname,
  pathname = window.location.pathname,
  href = window.location.href,
): AtsProvider {
  for (const adapter of ADAPTERS) {
    if (adapter.matches(hostname, pathname, href)) return adapter.id;
  }
  return "unknown";
}

export function getAdapter(provider?: AtsProvider): AtsAdapter | null {
  const id = provider ?? detectAts();
  return ADAPTERS.find((a) => a.id === id) ?? null;
}

/**
 * Primary page analysis pipeline.
 *
 * Always runs the generic engine. Adapters only enrich.
 */
export function detectFieldsForPage(): {
  ats: AtsProvider;
  fields: DetectedField[];
} {
  const ats = detectAts();
  const adapter = getAdapter(ats);

  // 1. Generic engine — always
  let fields = detectFields();

  // 2. Optional adapter enrichment
  if (adapter?.enrichFields) {
    try {
      fields = adapter.enrichFields(fields);
      logger.debug(SCOPE, `Enriched via ${adapter.id}`, { count: fields.length });
    } catch (err) {
      logger.warn(SCOPE, `Adapter enrich failed (${adapter.id}) — continuing`, err);
    }
  }

  // 3. Normalize into common schema (canonical keys, categories)
  fields = normalizeFields(fields);

  return { ats, fields };
}

export function extractJobForPage(): JobExtraction {
  const ats = detectAts();
  const adapter = getAdapter(ats);
  let partial: Partial<JobExtraction> = {};
  try {
    partial = adapter?.extractJob?.() ?? {};
  } catch (err) {
    logger.warn(SCOPE, "Job extraction failed — using URL only", err);
  }

  // Generic fallbacks when adapter returns nothing
  if (!partial.title) {
    partial.title =
      document.querySelector("h1")?.textContent?.trim() ||
      document.title.split(/[-|@]/)[0]?.trim();
  }

  return {
    ...partial,
    url: window.location.href,
    ats,
  };
}

export function didStepChange(previousUrl: string): boolean {
  const adapter = getAdapter();
  if (!adapter?.detectStepChange) {
    return previousUrl !== window.location.href;
  }
  return adapter.detectStepChange(previousUrl, window.location.href);
}
