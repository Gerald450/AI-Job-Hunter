/**
 * SmartRecruiters adapter — detection + light job extraction.
 * Field discovery remains fully generic.
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

export const smartrecruitersAdapter: AtsAdapter = {
  id: "smartrecruiters",

  matches(hostname) {
    return (
      hostname.includes("smartrecruiters.com") ||
      hostname.includes("jobs.smartrecruiters.com")
    );
  },

  enrichFields(fields) {
    return enrichLabelsFromContainers(
      fields,
      ".field, .form-group, .ojr__form-field, [class*='form-field'], [class*='FormField'], li, .checkbox",
      "label, .label, legend, [class*='label']",
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".job-title") || document.title.split(/[-|]/)[0]?.trim();
    const company = textOfFirst(".company-name", "[class*='company']");
    const location = textOfFirst(".job-location", "[class*='location']");
    const description = extractDescription(
      ".job-description",
      "article",
      "[class*='description']",
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
