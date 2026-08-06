/**
 * Greenhouse adapter — metadata enrichment only.
 * Field discovery is owned by the generic semantic engine.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { enrichLabelsFromContainers, textOf } from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const greenhouseAdapter: AtsAdapter = {
  id: "greenhouse",

  matches(hostname) {
    return hostname.includes("greenhouse.io");
  },

  enrichFields(fields) {
    return enrichLabelsFromContainers(
      fields,
      ".field, .form-group, .application--question, li",
      "label, .field--label, legend",
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOf(".app-title, h1.app-title, .job__title, h1") ||
      document.title.split(/[-|@]/)[0]?.trim();
    const company = textOf(
      ".company-name, .app-title + .company-name, .header-company, [data-qa='company-name']",
    );
    const location = textOf(
      ".location, .app-location, .job__location, [data-qa='location']",
    );
    const description = textOf(
      "#content, .job__description, .content, #job_description",
    );
    const bodyText = document.body.innerText.toLowerCase();

    return {
      title,
      company,
      location,
      description,
      remote: /\bremote\b/.test(bodyText),
      employmentType: /\bfull[- ]?time\b/i.test(bodyText)
        ? "Full-time"
        : /\bpart[- ]?time\b/i.test(bodyText)
          ? "Part-time"
          : /\bintern/i.test(bodyText)
            ? "Internship"
            : undefined,
    };
  },
};
