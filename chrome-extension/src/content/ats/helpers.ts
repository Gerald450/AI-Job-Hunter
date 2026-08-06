/**
 * Shared helpers for lightweight ATS adapters.
 * Adapters improve labels / job metadata — they do not re-detect fields.
 */

import { resolveLabel, resolveParentSection } from "@/content/detector";
import { categorizeField } from "@/lib/semantics";
import type { DetectedField } from "@/types";

export function textOf(selector: string): string | undefined {
  const el = document.querySelector(selector);
  const t = el?.textContent?.replace(/\s+/g, " ").trim();
  return t || undefined;
}

/**
 * Improve "Unknown Field" labels by looking at a nearby container selector.
 * Purely additive — never removes or replaces the generic field list.
 */
export function enrichLabelsFromContainers(
  fields: DetectedField[],
  containerSelector: string,
  labelSelector: string,
): DetectedField[] {
  return fields.map((field) => {
    if (field.label && field.label !== "Unknown Field" && field.canonicalKey) {
      return field;
    }

    const el = field.id
      ? document.getElementById(field.id)
      : field.name
        ? document.querySelector(`[name="${CSS.escape(field.name)}"]`)
        : null;
    if (!(el instanceof HTMLElement)) return field;

    const container = el.closest(containerSelector);
    const labelEl = container?.querySelector(labelSelector);
    const label = labelEl?.textContent
      ? labelEl.textContent.replace(/\s+/g, " ").replace(/\*$/, "").trim()
      : field.label !== "Unknown Field"
        ? field.label
        : resolveLabel(el);

    if (!label || label === field.label) return field;

    return {
      ...field,
      label,
      parentSection: field.parentSection || resolveParentSection(el),
      category: field.category || categorizeField(label),
    };
  });
}
