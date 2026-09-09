/**
 * Field normalization layer.
 *
 * Takes raw DetectedField objects from the generic engine (+ optional adapter
 * enrichment) and stamps canonical keys / categories so the backend and
 * autofill engine share one vocabulary.
 */

import {
  categorizeField,
  inferCanonicalKey,
  isUrlCanonicalKey,
  type CanonicalKey,
} from "@/lib/semantics";
import { logger } from "@/lib/logger";
import type { DetectedField } from "@/types";

const SCOPE = "normalize";

/** Label / accessible name — trusted over name/id tokens. */
function primarySignals(field: DetectedField): Array<string | undefined> {
  return [
    field.label,
    field.placeholder,
    field.ariaLabel,
    field.ariaLabelledBy,
  ];
}

function allSignals(field: DetectedField): Array<string | undefined> {
  return [
    ...primarySignals(field),
    field.ariaDescribedBy,
    field.nearbyText,
    field.parentSection,
    field.name,
    field.id,
  ];
}

function resolveCanonical(field: DetectedField) {
  const primary = primarySignals(field);
  const match = inferCanonicalKey(allSignals(field), {
    primaryCount: primary.filter((s) => Boolean(s && s.trim())).length || 1,
  });

  // Native URL inputs are website/link fields even when Workday ids mention "address".
  if (field.type === "url") {
    if (match && isUrlCanonicalKey(match.key)) {
      return match;
    }
    return {
      key: "website" as CanonicalKey,
      confidence: 1,
      matchedAlias: "input[type=url]",
    };
  }

  return match;
}

/**
 * Normalize a list of detected fields into the common schema.
 * Idempotent — safe to call after adapter enrichment.
 */
export function normalizeFields(fields: DetectedField[]): DetectedField[] {
  const normalized = fields.map((field) => {
    const match = resolveCanonical(field);
    const category =
      field.category ||
      categorizeField(...allSignals(field)) ||
      (match ? match.key : undefined);

    // Never keep a postal address key on a URL control.
    let canonicalKey = field.canonicalKey || match?.key;
    if (
      field.type === "url" &&
      canonicalKey &&
      !isUrlCanonicalKey(canonicalKey)
    ) {
      canonicalKey = "website";
    }

    const next: DetectedField = {
      ...field,
      label: field.label || "Unknown Field",
      canonicalKey,
      category,
      meta: {
        ...field.meta,
        ...(match
          ? {
              canonicalConfidence: match.confidence,
              matchedAlias: match.matchedAlias,
            }
          : {}),
      },
    };
    return next;
  });

  logger.debug(SCOPE, `Normalized ${normalized.length} fields`, {
    withCanonical: normalized.filter((f) => f.canonicalKey).length,
  });
  return normalized;
}

/** Look up a field by canonical key (first match). */
export function findByCanonical(
  fields: DetectedField[],
  key: CanonicalKey | string,
): DetectedField | undefined {
  return fields.find((f) => f.canonicalKey === key);
}
