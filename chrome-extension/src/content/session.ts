/**
 * Session value store — preserves autofilled values across multi-page
 * application flows (especially Workday step wizards).
 *
 * Values are keyed by canonicalKey (preferred) or normalized label, scoped
 * to the current origin so different employers don't leak into each other.
 */

import { normalizeLabel } from "@/lib/semantics";
import { logger } from "@/lib/logger";
import type { AutofillValue, DetectedField } from "@/types";

const SCOPE = "session";
const STORAGE_PREFIX = "aijh:session:";

interface SessionEntry {
  value: string | number | boolean;
  canonicalKey?: string;
  label: string;
  updatedAt: string;
}

type SessionMap = Record<string, SessionEntry>;

function storageKey(): string {
  return `${STORAGE_PREFIX}${window.location.origin}`;
}

export async function loadSession(): Promise<SessionMap> {
  try {
    const key = storageKey();
    const result = await chrome.storage.session.get(key);
    return (result[key] as SessionMap | undefined) ?? {};
  } catch {
    // session storage may be unavailable — fall back to in-memory
    return memoryFallback;
  }
}

export async function saveSession(map: SessionMap): Promise<void> {
  try {
    await chrome.storage.session.set({ [storageKey()]: map });
  } catch (err) {
    logger.warn(SCOPE, "chrome.storage.session unavailable — using memory", err);
    Object.assign(memoryFallback, map);
  }
}

const memoryFallback: SessionMap = {};

function entryKey(canonicalKey: string | undefined, label: string): string {
  return canonicalKey ? `c:${canonicalKey}` : `l:${normalizeLabel(label)}`;
}

/** Persist values that were just applied so later pages can reuse them. */
export async function rememberValues(
  fields: DetectedField[],
  values: AutofillValue[],
): Promise<void> {
  const map = await loadSession();
  const byLabel = new Map(fields.map((f) => [normalizeLabel(f.label), f]));
  const byCanonical = new Map(
    fields.filter((f) => f.canonicalKey).map((f) => [f.canonicalKey!, f]),
  );

  for (const v of values) {
    const field =
      (v.canonicalKey && byCanonical.get(v.canonicalKey)) ||
      byLabel.get(normalizeLabel(v.field));
    const label = field?.label || v.field;
    const canonicalKey = v.canonicalKey || field?.canonicalKey;
    map[entryKey(canonicalKey, label)] = {
      value: v.value,
      canonicalKey,
      label,
      updatedAt: new Date().toISOString(),
    };
  }

  await saveSession(map);
  logger.debug(SCOPE, `Remembered ${values.length} values`);
}

/**
 * Produce AutofillValues for empty fields that we filled on a previous step.
 * Never overwrites a field that already has a user/page value.
 */
export async function restoreSessionValues(
  fields: DetectedField[],
): Promise<AutofillValue[]> {
  const map = await loadSession();
  const out: AutofillValue[] = [];

  for (const field of fields) {
    if (field.type === "file" || field.type === "button" || field.type === "hidden") {
      continue;
    }
    if (field.currentValue && String(field.currentValue).trim() !== "") continue;

    const entry =
      (field.canonicalKey && map[entryKey(field.canonicalKey, field.label)]) ||
      map[entryKey(undefined, field.label)];

    if (!entry) continue;
    out.push({
      field: field.label,
      canonicalKey: field.canonicalKey,
      value: entry.value,
      confidence: 1,
    });
  }

  if (out.length) {
    logger.info(SCOPE, `Restoring ${out.length} values from prior steps`);
  }
  return out;
}

export async function clearSession(): Promise<void> {
  try {
    await chrome.storage.session.remove(storageKey());
  } catch {
    for (const k of Object.keys(memoryFallback)) delete memoryFallback[k];
  }
}
