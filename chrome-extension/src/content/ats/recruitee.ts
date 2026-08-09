/**
 * Recruitee adapter — detection + job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const recruiteeAdapter: AtsAdapter = {
  id: "recruitee",

  matches(hostname) {
    return (
      hostname.includes("recruitee.com") ||
      hostname.includes("careers.recruitee")
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".job-title", "[data-testid='offer-title']") ||
      document.title.split(/[-|]/)[0]?.trim();
    const company =
      textOfFirst(".company-name", "[data-testid='company-name']") ||
      window.location.hostname.split(".")[0];
    const location = textOfFirst(
      ".job-location",
      "[data-testid='offer-location']",
      "[class*='location']",
    );
    const description = extractDescription(
      ".job-description",
      "[data-testid='offer-description']",
      ".offer-description",
      "article",
      "main",
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
