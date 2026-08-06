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
  type CanonicalKey,
} from "@/lib/semantics";
import { logger } from "@/lib/logger";
import type { DetectedField } from "@/types";

const SCOPE = "normalize";

function signalsFor(field: DetectedField): Array<string | undefined> {
  return [
    field.label,
    field.placeholder,
    field.ariaLabel,
    field.ariaLabelledBy,
    field.ariaDescribedBy,
    field.nearbyText,
    field.parentSection,
    field.name,
    field.id,
  ];
}

/**
 * Normalize a list of detected fields into the common schema.
 * Idempotent — safe to call after adapter enrichment.
 */
export function normalizeFields(fields: DetectedField[]): DetectedField[] {
  const normalized = fields.map((field) => {
    const match = inferCanonicalKey(signalsFor(field));
    const category =
      field.category ||
      categorizeField(...signalsFor(field)) ||
      (match ? match.key : undefined);

    const next: DetectedField = {
      ...field,
      label: field.label || "Unknown Field",
      canonicalKey: field.canonicalKey || match?.key,
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
