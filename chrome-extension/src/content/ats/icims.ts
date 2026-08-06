/**
 * iCIMS adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { textOf } from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const icimsAdapter: AtsAdapter = {
  id: "icims",

  matches(hostname) {
    return hostname.includes("icims.com");
  },

  extractJob(): Partial<JobExtraction> {
    return {
      title: textOf("h1, .iCIMS_Header, .title") || document.title.split(/[-|]/)[0]?.trim(),
      company: textOf(".iCIMS_CompanyName, .company"),
      location: textOf(".iCIMS_JobHeaderData, .location"),
      description: textOf(".iCIMS_JobContent, .description, article"),
    };
  },
};
