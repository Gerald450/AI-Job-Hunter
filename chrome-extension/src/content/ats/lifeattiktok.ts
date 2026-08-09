/**
 * TikTok / ByteDance custom careers site (lifeattiktok.com).
 * Not a standard ATS — job detail pages use custom DOM (often h2 titles).
 */

import type { AtsAdapter } from "@/content/ats/types";
import {
  detectRemoteAndEmployment,
  extractDescription,
  extractSections,
  isVisible,
  textOfFirst,
  visibleText,
} from "@/content/ats/helpers";
import type { JobExtraction } from "@/types";

function sectionByLabel(label: RegExp): string | undefined {
  const nodes = document.querySelectorAll("h1, h2, h3, h4, h5, div, span, p, strong, b");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
    const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!label.test(text) || text.length > 48) continue;

    const chunks: string[] = [];
    let sib: Element | null = node.nextElementSibling;
    let steps = 0;
    while (sib && steps < 20) {
      if (!(sib instanceof HTMLElement)) {
        sib = sib.nextElementSibling;
        steps += 1;
        continue;
      }
      const sibText = sib.textContent?.replace(/\s+/g, " ").trim() || "";
      if (
        /^(responsibilities|qualifications|job information|about tiktok|why join us|diversity)/i.test(
          sibText,
        ) &&
        sibText.length < 48
      ) {
        break;
      }
      if (isVisible(sib)) {
        const t = visibleText(sib);
        if (t && t.length > 20) chunks.push(t);
      }
      sib = sib.nextElementSibling;
      steps += 1;
    }

    // Some layouts put body text in a sibling container's first child.
    if (!chunks.length) {
      const parent = node.parentElement;
      if (parent) {
        const t = visibleText(parent);
        const stripped = t.replace(label, "").trim();
        if (stripped.length > 80) return stripped;
      }
    }

    const body = chunks.join("\n\n").trim();
    if (body.length > 40) return body;
  }
  return undefined;
}

export const lifeattiktokAdapter: AtsAdapter = {
  id: "lifeattiktok",

  matches(hostname) {
    return (
      hostname.includes("lifeattiktok.com") ||
      hostname.includes("careers.tiktok.com") ||
      hostname.includes("jobs.bytedance.com")
    );
  },

  extractJob(): Partial<JobExtraction> {
    const title =
      textOfFirst("h2", "h1", "[class*='job-title']", "[class*='JobTitle']") ||
      document.title.split(/[-|]/)[0]?.trim();

    const location =
      textOfFirst("[class*='location']", "[class*='Location']") ||
      (() => {
        const match = document.body.innerText.match(
          /Location\s*:?\s*\n?\s*([^\n]+)/i,
        );
        return match?.[1]?.trim();
      })();

    const employmentType =
      (() => {
        const match = document.body.innerText.match(
          /Employment Type\s*:?\s*\n?\s*([^\n]+)/i,
        );
        return match?.[1]?.trim();
      })() || undefined;

    const responsibilities =
      sectionByLabel(/^responsibilities$/i) ||
      extractSections().responsibilities;
    const requirements =
      sectionByLabel(/^qualifications$/i) || extractSections().requirements;

    const description =
      extractDescription(
        "[class*='job-detail']",
        "[class*='JobDetail']",
        "[class*='description']",
        "article",
        "main",
      ) ||
      [responsibilities, requirements].filter(Boolean).join("\n\n") ||
      undefined;

    const { remote } = detectRemoteAndEmployment(location);

    return {
      title,
      company: "TikTok",
      location,
      description,
      responsibilities,
      requirements,
      employmentType,
      remote,
    };
  },
};
