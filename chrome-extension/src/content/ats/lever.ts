/**
 * Lever adapter — metadata enrichment only.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { enrichLabelsFromContainers, textOf } from "@/content/ats/helpers";
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
    const title = textOf(
      ".posting-headline h2, h2.posting-name, .posting-title, h2",
    );
    const companyFromPath = window.location.pathname.split("/").filter(Boolean)[0];
    const company =
      textOf(".main-header-logo img[alt]")?.replace(/\s+logo$/i, "").trim() ||
      companyFromPath;
    const location = textOf(
      ".posting-categories .location, .posting-category.location, .sort-by-location",
    );
    const commitment = textOf(
      ".posting-categories .commitment, .posting-category.commitment",
    );
    const description = textOf(
      ".posting-page .content, .section-wrapper, [data-qa='job-description']",
    );
    const bodyText = document.body.innerText.toLowerCase();

    return {
      title,
      company,
      location,
      description,
      employmentType: commitment,
      remote: /\bremote\b/.test(bodyText) || /\bremote\b/i.test(location || ""),
    };
  },
};
