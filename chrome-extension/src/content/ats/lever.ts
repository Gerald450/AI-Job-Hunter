/**
 * Lever adapter — metadata enrichment only.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  enrichLabelsFromContainers,
  extractDescription,
  extractSections,
  textOf,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const leverAdapter: AtsAdapter = {
  id: "lever",

  matches(hostname) {
    return hostname.includes("lever.co");
  },

  enrichFields(fields) {
    return enrichLabelsFromContainers(
      fields,
      ".application-question, .custom-question, .form-group, .field",
      ".application-label, .application-question-label, label, h4, .text",
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title = textOfFirst(
      ".posting-headline h2",
      "h2.posting-name",
      ".posting-title",
      "h2",
    );
    const companyFromPath = window.location.pathname.split("/").filter(Boolean)[0];
    const company =
      textOf(".main-header-logo img[alt]")?.replace(/\s+logo$/i, "").trim() ||
      companyFromPath;
    const location = textOfFirst(
      ".posting-categories .location",
      ".posting-category.location",
      ".sort-by-location",
    );
    const commitment = textOfFirst(
      ".posting-categories .commitment",
      ".posting-category.commitment",
    );
    const description = extractDescription(
      ".posting-page .content",
      ".section-wrapper",
      "[data-qa='job-description']",
      ".posting-description",
    );
    const sections = extractSections();
    const { remote } = detectRemoteAndEmployment(location);

    return {
      title,
      company,
      location,
      description,
      ...sections,
      employmentType: commitment,
      remote,
    };
  },
};
