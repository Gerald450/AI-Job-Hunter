/**
 * Teamtailor adapter — detection + job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const teamtailorAdapter: AtsAdapter = {
  id: "teamtailor",

  matches(hostname) {
    return (
      hostname.includes("teamtailor.com") ||
      hostname.includes("career.teamtailor")
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".job-header__title", "[data-testid='job-title']") ||
      document.title.split(/[-|]/)[0]?.trim();
    const company = textOfFirst(
      ".company-name",
      "[data-testid='company-name']",
      "header .logo img[alt]",
    );
    const location = textOfFirst(
      ".job-location",
      "[data-testid='job-location']",
      "[class*='location']",
    );
    const description = extractDescription(
      ".job-body",
      ".body",
      "[data-testid='job-description']",
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
