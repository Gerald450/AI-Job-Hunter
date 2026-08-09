/**
 * Jobvite adapter — detection + job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const jobviteAdapter: AtsAdapter = {
  id: "jobvite",

  matches(hostname) {
    return (
      hostname.includes("jobvite.com") ||
      hostname.includes("jobs.jobvite.com") ||
      hostname.includes("hire.jobvite.com")
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".jv-header", ".jobTitle", ".jv-job-detail-title") ||
      document.title.split(/[-|]/)[0]?.trim();
    const company = textOfFirst(
      ".jv-header-company",
      ".company-name",
      "[class*='company']",
    );
    const location = textOfFirst(
      ".jv-job-detail-meta",
      ".job-location",
      "[class*='location']",
    );
    const description = extractDescription(
      ".jv-job-detail-description",
      ".jobDescription",
      "#jobDescription",
      "article",
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
