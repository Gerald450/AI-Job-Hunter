/**
 * Workday adapter — lightweight enhancements only.
 *
 * Workday tenants customize IDs, field names, and DOM structure freely.
 * Therefore this adapter NEVER relies on fixed field selectors for detection.
 * The generic semantic engine remains fully functional without this module.
 *
 * Enhancements provided here:
 *   - Hostname detection (myworkdayjobs.com / workday.com career sites)
 *   - Step-change detection for multi-page application wizards
 *   - Soft label enrichment via generic data-automation-id proximity (not required)
 *   - Job metadata extraction from visible headings
 */

import type { AtsAdapter } from "@/content/ats/types";
import { enrichLabelsFromContainers, textOf } from "@/content/ats/helpers";
import type { DetectedField, JobExtraction } from "@/types";

function isWorkdayHost(hostname: string): boolean {
  return (
    hostname.includes("myworkdayjobs.com") ||
    hostname.includes("workdayjobs.com") ||
    hostname.includes("wd1.myworkdaysite.com") ||
    hostname.includes("wd3.myworkdaysite.com") ||
    hostname.includes("wd5.myworkdaysite.com") ||
    /\.wd\d+\./i.test(hostname) ||
    // Some tenants reverse-proxy under careers.* but still expose Workday markers
    (hostname.includes("workday") && !hostname.includes("workday.com/en-us/products"))
  );
}

function currentStepLabel(): string | undefined {
  // Prefer ARIA / visible progress indicators over brittle IDs
  return (
    textOf('[aria-current="step"]') ||
    textOf('[aria-current="page"]') ||
    textOf('[role="progressbar"]') ||
    textOf("nav [aria-selected='true']") ||
    undefined
  );
}

export const workdayAdapter: AtsAdapter = {
  id: "workday",

  matches(hostname, _pathname, href) {
    if (isWorkdayHost(hostname)) return true;
    // Fallback: Workday SPA marker in the document when host is a custom domain
    if (typeof document !== "undefined") {
      const hasMarker =
        Boolean(document.querySelector("[data-automation-id]")) &&
        (href?.includes("/job/") ||
          href?.includes("/apply") ||
          document.body?.innerText?.toLowerCase().includes("workday"));
      return hasMarker && hostname.includes("myworkday");
    }
    return false;
  },

  enrichFields(fields: DetectedField[]): DetectedField[] {
    // Soft enrichment only — improve Unknown labels via nearby text containers.
    // data-automation-id is used as a *container* hint, never as a required selector.
    const enriched = enrichLabelsFromContainers(
      fields,
      "[data-automation-id], fieldset, [role='group'], li",
      "label, legend, [data-automation-id*='label'], span",
    );

    const step = currentStepLabel();
    if (!step) return enriched;

    return enriched.map((f) => ({
      ...f,
      meta: { ...f.meta, workdayStep: step },
      parentSection: f.parentSection || step,
    }));
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOf("h2, h1, [data-automation-id='jobPostingHeader']") ||
      document.title.split(/[-|]/)[0]?.trim();
    const location = textOf(
      "[data-automation-id='locations'], [data-automation-id='location']",
    );
    const description = textOf(
      "[data-automation-id='jobPostingDescription'], [data-automation-id='job-posting-description']",
    );
    // Company often lives in the subdomain: acme.wd1.myworkdayjobs.com
    const hostParts = window.location.hostname.split(".");
    const company =
      textOf("[data-automation-id='company']") ||
      (hostParts[0] && !hostParts[0].startsWith("wd") ? hostParts[0] : undefined);
    const bodyText = document.body.innerText.toLowerCase();

    return {
      title,
      company,
      location,
      description,
      remote: /\bremote\b/.test(bodyText) || /\bremote\b/i.test(location || ""),
    };
  },

  detectStepChange(previousUrl, currentUrl) {
    if (previousUrl === currentUrl) {
      // Same URL — Workday often uses client-side step changes without navigation
      const step = currentStepLabel();
      return Boolean(step);
    }
    // Path segment change under /apply or /job indicates a wizard step
    try {
      const prev = new URL(previousUrl);
      const curr = new URL(currentUrl);
      return prev.pathname !== curr.pathname || prev.search !== curr.search;
    } catch {
      return previousUrl !== currentUrl;
    }
  },
};
