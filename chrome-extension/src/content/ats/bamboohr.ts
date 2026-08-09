/**
 * BambooHR adapter — detection + job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const bamboohrAdapter: AtsAdapter = {
  id: "bamboohr",

  matches(hostname) {
    return (
      hostname.includes("bamboohr.com") ||
      hostname.includes("bamboohr.co")
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".jss-JobOpening", ".ResAts__header-title") ||
      document.title.split(/[-|]/)[0]?.trim();
    const company =
      textOfFirst(".company-name", "[class*='Company']") ||
      window.location.hostname.split(".")[0];
    const location = textOfFirst(
      ".ResAts__header-location",
      "[class*='location']",
      ".location",
    );
    const description = extractDescription(
      ".ResAts__card-content",
      ".job-description",
      "#jobDescription",
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
