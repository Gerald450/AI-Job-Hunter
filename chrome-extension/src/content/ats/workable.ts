/**
 * Workable adapter — metadata enrichment only.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { enrichLabelsFromContainers, textOf } from "@/content/ats/helpers";
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
      textOf('h1, [data-ui="job-title"], .job-title') ||
      document.title.split(/[-|@]/)[0]?.trim();
    const company =
      textOf('[data-ui="company-name"], .company-name, .company') ||
      window.location.hostname.split(".")[0];
    const location = textOf(
      '[data-ui="job-location"], .job-location, .location',
    );
    const description = textOf(
      '[data-ui="job-description"], .job-description, #job-description, article',
    );
    const bodyText = document.body.innerText.toLowerCase();

    return {
      title,
      company,
      location,
      description,
      remote: /\bremote\b/.test(bodyText) || /\bremote\b/i.test(location || ""),
      salary: textOf('[data-ui="salary"], .salary') || undefined,
      employmentType: /\bfull[- ]?time\b/i.test(bodyText)
        ? "Full-time"
        : /\bpart[- ]?time\b/i.test(bodyText)
          ? "Part-time"
          : undefined,
    };
  },
};
