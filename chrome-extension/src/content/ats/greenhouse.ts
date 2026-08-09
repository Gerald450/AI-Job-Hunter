/**
 * Greenhouse adapter — metadata enrichment only.
 * Field discovery is owned by the generic semantic engine.
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
      textOfFirst(".app-title", "h1.app-title", ".job__title", "h1") ||
      document.title.split(/[-|@]/)[0]?.trim();
    const company = textOfFirst(
      ".company-name",
      ".header-company",
      "[data-qa='company-name']",
    );
    const location = textOfFirst(
      ".location",
      ".app-location",
      ".job__location",
      "[data-qa='location']",
    );
    const description = extractDescription(
      "#content",
      ".job__description",
      ".content",
      "#job_description",
      ".job-post",
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
