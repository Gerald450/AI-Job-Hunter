/**
 * iCIMS adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const icimsAdapter: AtsAdapter = {
  id: "icims",

  matches(hostname) {
    return hostname.includes("icims.com");
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".iCIMS_Header", ".title") ||
      document.title.split(/[-|]/)[0]?.trim();
    const company = textOfFirst(".iCIMS_CompanyName", ".company");
    const location = textOfFirst(".iCIMS_JobHeaderData", ".location");
    const description = extractDescription(
      ".iCIMS_JobContent",
      ".description",
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
