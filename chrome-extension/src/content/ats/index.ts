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
 * Job extraction maps to the JobExtractor concept:
 *   matches(hostname,…) ≈ canHandle(url)
 *   extractJob()        ≈ extract() → JobPage / JobExtraction
 *
 * Adding a new ATS = implement AtsAdapter + register below.
 * Never modify the detector or autofill engine.
 */

import { ashbyAdapter } from "@/content/ats/ashby";
import { bamboohrAdapter } from "@/content/ats/bamboohr";
import { greenhouseAdapter } from "@/content/ats/greenhouse";
import { icimsAdapter } from "@/content/ats/icims";
import { jobviteAdapter } from "@/content/ats/jobvite";
import { leverAdapter } from "@/content/ats/lever";
import { lifeattiktokAdapter } from "@/content/ats/lifeattiktok";
import { oracleAdapter } from "@/content/ats/oracle";
import { recruiteeAdapter } from "@/content/ats/recruitee";
import { smartrecruitersAdapter } from "@/content/ats/smartrecruiters";
import { successfactorsAdapter } from "@/content/ats/successfactors";
import { taleoAdapter } from "@/content/ats/taleo";
import { teamtailorAdapter } from "@/content/ats/teamtailor";
import { workdayAdapter } from "@/content/ats/workday";
import { workableAdapter } from "@/content/ats/workable";
import type { AtsAdapter } from "@/content/ats/types";
import {
  descriptionFingerprint,
  extractDescription,
  extractSections,
} from "@/content/ats/helpers";
import { detectFields } from "@/content/detector";
import { normalizeFields } from "@/content/normalize";
import { logger } from "@/lib/logger";
import type { AtsProvider, DetectedField, JobExtraction } from "@/types";

export type { AtsAdapter };

const SCOPE = "ats";

/** Ordered list — more specific hosts should come before generic ones. */
const ADAPTERS: AtsAdapter[] = [
  lifeattiktokAdapter,
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
  jobviteAdapter,
  teamtailorAdapter,
  bamboohrAdapter,
  recruiteeAdapter,
];

/** Session scrape cache — avoid re-querying the DOM until the page changes. */
let jobCache: { key: string; job: JobExtraction } | null = null;

export function invalidateJobCache(): void {
  jobCache = null;
}

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

export function extractJobForPage(options?: { force?: boolean }): JobExtraction {
  const ats = detectAts();
  const url = window.location.href;

  if (!options?.force && jobCache && jobCache.job.url === url) {
    return jobCache.job;
  }

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
      document.querySelector("h2")?.textContent?.trim() ||
      document.title.split(/[-|@]/)[0]?.trim();
  }

  if (!partial.requirements || !partial.responsibilities) {
    const sections = extractSections();
    partial.requirements = partial.requirements || sections.requirements;
    partial.responsibilities =
      partial.responsibilities || sections.responsibilities;
  }

  if (!partial.description) {
    partial.description =
      extractDescription("article", "main", "[role='main']") ||
      [partial.responsibilities, partial.requirements]
        .filter(Boolean)
        .join("\n\n") ||
      undefined;
  }

  const job: JobExtraction = {
    ...partial,
    url,
    ats,
  };

  jobCache = {
    key: `${url}|${descriptionFingerprint(job.description)}`,
    job,
  };
  return job;
}

export function didStepChange(previousUrl: string): boolean {
  const adapter = getAdapter();
  if (!adapter?.detectStepChange) {
    return previousUrl !== window.location.href;
  }
  return adapter.detectStepChange(previousUrl, window.location.href);
}
