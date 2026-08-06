/**
 * SmartRecruiters adapter — detection + light job extraction.
 * Field discovery remains fully generic.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { textOf } from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const smartrecruitersAdapter: AtsAdapter = {
  id: "smartrecruiters",

  matches(hostname) {
    return (
      hostname.includes("smartrecruiters.com") ||
      hostname.includes("jobs.smartrecruiters.com")
    );
  },

  extractJob(): Partial<JobExtraction> {
    return {
      title: textOf("h1, .job-title") || document.title.split(/[-|]/)[0]?.trim(),
      company: textOf(".company-name, [class*='company']"),
      location: textOf(".job-location, [class*='location']"),
      description: textOf(".job-description, article, [class*='description']"),
    };
  },
};
