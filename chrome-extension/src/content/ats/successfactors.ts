/**
 * SAP SuccessFactors adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { textOf } from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const successfactorsAdapter: AtsAdapter = {
  id: "successfactors",

  matches(hostname) {
    return (
      hostname.includes("successfactors.com") ||
      hostname.includes("successfactors.eu") ||
      hostname.includes("sapsf.com")
    );
  },

  extractJob(): Partial<JobExtraction> {
    return {
      title: textOf("h1, .jobTitle") || document.title.split(/[-|]/)[0]?.trim(),
      location: textOf(".jobLocation, [class*='location']"),
      description: textOf(".jobDescription, article"),
    };
  },
};
