/**
 * SAP SuccessFactors adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
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
    const title =
      textOfFirst("h1", ".jobTitle") || document.title.split(/[-|]/)[0]?.trim();
    const location = textOfFirst(".jobLocation", "[class*='location']");
    const description = extractDescription(".jobDescription", "article", "main");
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
