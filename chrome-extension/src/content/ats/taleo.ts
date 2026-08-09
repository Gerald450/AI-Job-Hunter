/**
 * Taleo (Oracle Taleo) adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const taleoAdapter: AtsAdapter = {
  id: "taleo",

  matches(hostname) {
    return hostname.includes("taleo.net") || hostname.includes("taleo.com");
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".title", ".jobtitle") ||
      document.title.split(/[-|]/)[0]?.trim();
    const location = textOfFirst(".location", ".joblocation");
    const description = extractDescription(".content", ".description", "article");
    const sections = extractSections();
    const { remote, employmentType } = detectRemoteAndEmployment(location);

    return {
      title,
      location,
      description,
      ...sections,
      remote,
      employmentType,
    };
  },
};
