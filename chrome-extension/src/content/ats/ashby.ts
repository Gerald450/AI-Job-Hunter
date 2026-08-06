/**
 * Ashby adapter — metadata enrichment only.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { enrichLabelsFromContainers, textOf } from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const ashbyAdapter: AtsAdapter = {
  id: "ashby",

  matches(hostname) {
    return hostname.includes("ashbyhq.com");
  },

  enrichFields(fields) {
    return enrichLabelsFromContainers(
      fields,
      '[class*="field"], [class*="Field"], [class*="question"], [data-testid*="field"]',
      "label, [class*='label'], [class*='Label'], legend, p",
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOf('h1, [class*="JobTitle"], [data-testid="job-title"]') ||
      document.title.split(/[-|]/)[0]?.trim();
    const companyFromPath = window.location.pathname.split("/").filter(Boolean)[0];
    const company =
      textOf('[class*="CompanyName"], [data-testid="company-name"]') ||
      companyFromPath;
    const location = textOf(
      '[class*="Location"], [data-testid="location"], [class*="job-location"]',
    );
    const description = textOf(
      '[class*="JobDescription"], [class*="Description"], article, [data-testid="job-description"]',
    );
    const bodyText = document.body.innerText.toLowerCase();

    return {
      title,
      company,
      location,
      description,
      remote: /\bremote\b/.test(bodyText) || /\bremote\b/i.test(location || ""),
      employmentType: /\bfull[- ]?time\b/i.test(bodyText)
        ? "Full-time"
        : /\bintern/i.test(bodyText)
          ? "Internship"
          : undefined,
    };
  },
};
