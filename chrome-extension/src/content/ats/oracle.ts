/**
 * Oracle Recruiting Cloud adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  textOfFirst,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const oracleAdapter: AtsAdapter = {
  id: "oracle",

  matches(hostname) {
    return (
      hostname.includes("oraclecloud.com") ||
      hostname.includes("fa.oraclecloud.com") ||
      hostname.includes("recruiting.oracle")
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h1", ".job-title") || document.title.split(/[-|]/)[0]?.trim();
    const location = textOfFirst(".job-location", "[class*='location']");
    const description = extractDescription(".job-description", "article", "main");
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
