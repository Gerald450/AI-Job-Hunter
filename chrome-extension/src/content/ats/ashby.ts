/**
 * Ashby adapter — metadata enrichment only.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  enrichLabelsFromContainers,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
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
      textOfFirst("h1", '[class*="JobTitle"]', '[data-testid="job-title"]') ||
      document.title.split(/[-|]/)[0]?.trim();
    const companyFromPath = window.location.pathname.split("/").filter(Boolean)[0];
    const company =
      textOfFirst('[class*="CompanyName"]', '[data-testid="company-name"]') ||
      companyFromPath;
    const location = textOfFirst(
      '[class*="Location"]',
      '[data-testid="location"]',
      '[class*="job-location"]',
    );
    const description = extractDescription(
      '[class*="JobDescription"]',
      '[class*="Description"]',
      "article",
      '[data-testid="job-description"]',
    );
    const sections = extractSections();
    const { remote, employmentType } = detectRemoteAndEmployment(location);

    return {
      title,
      company,
      location,
      description,
      ...sections,
      remote,
      employmentType,
    };
  },
};
