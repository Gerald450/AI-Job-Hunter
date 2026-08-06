/**
 * Oracle Recruiting Cloud adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { textOf } from "@/content/ats/helpers";
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
    return {
      title: textOf("h1, .job-title") || document.title.split(/[-|]/)[0]?.trim(),
      location: textOf(".job-location, [class*='location']"),
      description: textOf(".job-description, article"),
    };
  },
};
