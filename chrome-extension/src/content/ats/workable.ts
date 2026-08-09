/**
 * Workable adapter — metadata enrichment only.
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

export const workableAdapter: AtsAdapter = {
  id: "workable",

  matches(hostname) {
    return hostname.includes("workable.com");
  },

  enrichFields(fields) {
    return enrichLabelsFromContainers(
      fields,
      ".form-group, .field, [class*='question'], [data-ui], li",
      "label, .label, legend, strong",
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", '[data-ui="job-title"]', ".job-title") ||
      document.title.split(/[-|@]/)[0]?.trim();
    const company =
      textOfFirst('[data-ui="company-name"]', ".company-name", ".company") ||
      window.location.hostname.split(".")[0];
    const location = textOfFirst(
      '[data-ui="job-location"]',
      ".job-location",
      ".location",
    );
    const description = extractDescription(
      '[data-ui="job-description"]',
      ".job-description",
      "#job-description",
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
      salary: textOf('[data-ui="salary"], .salary') || undefined,
      employmentType,
    };
  },
};
