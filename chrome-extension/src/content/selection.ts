/**
 * Manual selection / clipboard helpers for job-description fallback.
 */

import { extractJobForPage } from "@/content/ats";
import type { DescriptionSource, JobExtraction } from "@/types";

export const MIN_MANUAL_DESCRIPTION_CHARS = 300;
export const MIN_DOM_DESCRIPTION_CHARS = 40;

export const HIGHLIGHT_GUIDANCE =
  "Please highlight the complete job description before analyzing.";

export const FALLBACK_GUIDANCE =
  "Could not retrieve a job description. Highlight the full posting, then use Analyze Selected Text (or right-click → Analyze Highlighted Job Description), or Analyze from Clipboard.";

export function getSelectedText(): string {
  try {
    return window.getSelection()?.toString() ?? "";
  } catch {
    return "";
  }
}

export function validateJobDescriptionText(
  text: string | null | undefined,
): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = (text ?? "").trim();
  if (!trimmed || trimmed.length < MIN_MANUAL_DESCRIPTION_CHARS) {
    return { ok: false, error: HIGHLIGHT_GUIDANCE };
  }
  return { ok: true, text: trimmed };
}

export function isDomDescriptionUsable(description: string | undefined): boolean {
  return Boolean(description && description.trim().length >= MIN_DOM_DESCRIPTION_CHARS);
}

/**
 * Build a job payload that uses override text as the sole description body.
 * Page metadata (title/company/url) still comes from DOM extraction when present.
 */
export function buildJobFromOverride(
  text: string,
  _source: Extract<DescriptionSource, "manual_selection" | "clipboard">,
): JobExtraction {
  const base = extractJobForPage({ force: true });
  return {
    ...base,
    description: text.trim(),
    // Avoid diluting a deliberate selection/clipboard paste with weak sections.
    requirements: undefined,
    responsibilities: undefined,
  };
}
