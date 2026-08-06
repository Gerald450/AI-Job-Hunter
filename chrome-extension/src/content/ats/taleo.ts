/**
 * Taleo (Oracle Taleo) adapter — detection + light job extraction.
 */

import type { AtsAdapter } from "@/content/ats/types";
import { textOf } from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

export const taleoAdapter: AtsAdapter = {
  id: "taleo",

  matches(hostname) {
    return hostname.includes("taleo.net") || hostname.includes("taleo.com");
  },

  extractJob(): Partial<JobExtraction> {
    return {
      title: textOf("h1, .title, .jobtitle") || document.title.split(/[-|]/)[0]?.trim(),
      location: textOf(".location, .joblocation"),
      description: textOf(".content, .description, article"),
    };
  },
};
