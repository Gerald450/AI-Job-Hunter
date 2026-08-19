/**
 * Persist successful AI / user field→profile mappings (no personal values).
 *
 * Keyed by ATS + normalized label + name + id so the next visit can fill
 * without calling the LLM.
 */

import {
  CANONICAL_TO_PROFILE,
  normalizeLabel,
  registerAlias,
  type CanonicalKey,
} from "@/lib/semantics";
import {
  getFieldMappings,
  saveFieldMappings,
  type FieldMappingEntry,
} from "@/lib/storage";
import type { DetectedField, UserProfile } from "@/types";
import { logger } from "@/lib/logger";

const SCOPE = "field-learning";

export function mappingKey(
  ats: string,
  label: string,
  name?: string,
  id?: string,
): string {
  return [
    ats || "unknown",
    normalizeLabel(label),
    (name || "").toLowerCase(),
    (id || "").toLowerCase(),
  ].join("|");
}

function profileValueFromCanonical(
  profile: UserProfile,
  profileField: string,
): string | null {
  if (profileField === "full_name") {
    const parts = [profile.firstName, profile.middleName, profile.lastName].filter(
      Boolean,
    );
    return parts.length ? parts.join(" ") : null;
  }
  const key =
    CANONICAL_TO_PROFILE[profileField as CanonicalKey] ??
    (profileField as keyof UserProfile);
  const value = profile[key as keyof UserProfile];
  if (value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Resolve learned mappings into AutofillValue-like fill entries for fields
 * that match stored label/name/id keys for this ATS.
 */
export async function applyLearnedMappings(
  ats: string,
  fields: DetectedField[],
  profile: UserProfile | null,
): Promise<
  Array<{
    field: string;
    canonicalKey?: string;
    value: string | boolean | number;
    confidence: number;
  }>
> {
  if (!profile) return [];
  const store = await getFieldMappings();
  const out: Array<{
    field: string;
    canonicalKey?: string;
    value: string | boolean | number;
    confidence: number;
  }> = [];

  for (const field of fields) {
    if (field.type === "file" || field.type === "button" || field.type === "hidden") {
      continue;
    }
    const key = mappingKey(ats, field.label, field.name, field.id);
    const entry = store[key];
    if (!entry?.profileField) continue;

    const value = profileValueFromCanonical(profile, entry.profileField);
    if (value === null) continue;

    out.push({
      field: field.label,
      canonicalKey: entry.profileField,
      value,
      confidence: 1,
    });

    // Boost in-session alias registry
    try {
      registerAlias(field.label, entry.profileField as CanonicalKey);
    } catch {
      /* ignore unknown canonical keys */
    }
  }

  if (out.length) {
    logger.info(SCOPE, `Applied ${out.length} learned field mappings`);
  }
  return out;
}

/** Persist a successful mapping (profile field key only — never the value). */
export async function rememberFieldMapping(opts: {
  ats: string;
  label: string;
  name?: string;
  id?: string;
  profileField: string;
}): Promise<void> {
  if (!opts.profileField.trim()) return;
  const key = mappingKey(opts.ats, opts.label, opts.name, opts.id);
  const store = await getFieldMappings();
  const entry: FieldMappingEntry = {
    ats: opts.ats || "unknown",
    labelNorm: normalizeLabel(opts.label),
    name: opts.name,
    id: opts.id,
    profileField: opts.profileField,
  };
  store[key] = entry;
  await saveFieldMappings(store);
  try {
    registerAlias(opts.label, opts.profileField as CanonicalKey);
  } catch {
    /* ignore */
  }
  logger.debug(SCOPE, `Learned mapping ${key} → ${opts.profileField}`);
}

export async function rememberMappingsForFields(
  ats: string,
  fields: DetectedField[],
  values: Array<{ field: string; canonicalKey?: string; uid?: string }>,
): Promise<void> {
  for (const v of values) {
    if (!v.canonicalKey) continue;
    const field =
      (v.uid && fields.find((f) => f.uid === v.uid)) ||
      fields.find((f) => f.label === v.field) ||
      fields.find(
        (f) => normalizeLabel(f.label) === normalizeLabel(v.field),
      );
    if (!field) continue;
    await rememberFieldMapping({
      ats,
      label: field.label,
      name: field.name,
      id: field.id,
      profileField: v.canonicalKey,
    });
  }
}
