/**
 * ATS adapter contract.
 *
 * Adapters are optional optimizations. They must NEVER:
 *   - replace the generic field detection engine
 *   - implement their own autofill logic
 *
 * They MAY:
 *   - detect that the current page belongs to their ATS (≈ JobExtractor.canHandle)
 *   - enrich already-detected fields with extra metadata
 *   - extract job posting details (≈ JobExtractor.extract → JobExtraction)
 *   - observe multi-step navigation (e.g. Workday)
 */

import type { AtsProvider, DetectedField, JobExtraction } from "@/types";

export interface AtsAdapter {
  readonly id: AtsProvider;

  /** Return true when this adapter owns the current page (≈ canHandle). */
  matches(hostname: string, pathname: string, href?: string): boolean;

  /**
   * Optional enrichment of fields already discovered by the generic engine.
   * Must return the same array length (or a superset) — never drop fields.
   */
  enrichFields?(fields: DetectedField[]): DetectedField[];

  /** Optional job description extraction (≈ extract → JobPage). */
  extractJob?(): Partial<JobExtraction>;

  /**
   * Optional hook when a multi-step wizard advances (Workday, etc.).
   * Return true if the page appears to be a new application step.
   */
  detectStepChange?(previousUrl: string, currentUrl: string): boolean;
}
