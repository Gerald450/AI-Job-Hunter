/**
 * Typed Chrome Storage wrappers.
 *
 * All persistent extension state flows through these helpers so callers never
 * touch `chrome.storage` directly and Zod always validates on read.
 */

import {
  DEFAULT_PROFILE_VALUES,
  DEFAULT_SETTINGS,
  ExtensionSettingsSchema,
  RecentApplicationSchema,
  UserProfileSchema,
  type ExtensionSettings,
  type RecentApplication,
  type UserProfile,
} from "@/types";
import { logger } from "@/lib/logger";
import { z } from "zod";

const SCOPE = "storage";

const KEYS = {
  settings: "settings",
  profile: "profile",
  recentApplications: "recentApplications",
  fieldMappings: "fieldMappings",
} as const;

export const FieldMappingEntrySchema = z.object({
  ats: z.string(),
  labelNorm: z.string(),
  name: z.string().optional(),
  id: z.string().optional(),
  /** Canonical / profile field key — never a personal value. */
  profileField: z.string(),
});
export type FieldMappingEntry = z.infer<typeof FieldMappingEntrySchema>;

const FieldMappingsStoreSchema = z.record(z.string(), FieldMappingEntrySchema);
export type FieldMappingsStore = z.infer<typeof FieldMappingsStoreSchema>;

/* -------------------------------------------------------------------------- */
/* Low-level helpers                                                          */
/* -------------------------------------------------------------------------- */

async function getLocal<T>(key: string): Promise<T | undefined> {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  } catch (err) {
    logger.error(SCOPE, `Failed to read key "${key}"`, err);
    return undefined;
  }
}

async function setLocal(key: string, value: unknown): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (err) {
    logger.error(SCOPE, `Failed to write key "${key}"`, err);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export async function getSettings(): Promise<ExtensionSettings> {
  const raw = await getLocal<unknown>(KEYS.settings);
  if (!raw) return { ...DEFAULT_SETTINGS };
  const parsed = ExtensionSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(SCOPE, "Invalid settings in storage — resetting to defaults", parsed.error);
    return { ...DEFAULT_SETTINGS };
  }
  return parsed.data;
}

export async function saveSettings(
  partial: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const merged = ExtensionSettingsSchema.parse({ ...current, ...partial });
  await setLocal(KEYS.settings, merged);
  logger.info(SCOPE, "Settings saved");
  return merged;
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

/** Fill missing demographic / location keys from personal defaults. */
export function applyProfileDefaults(profile: UserProfile): UserProfile {
  const merged: UserProfile = { ...profile };
  for (const [key, value] of Object.entries(DEFAULT_PROFILE_VALUES) as Array<
    [keyof UserProfile, UserProfile[keyof UserProfile]]
  >) {
    const current = merged[key];
    if (current === undefined || current === null || current === "") {
      Object.assign(merged, { [key]: value });
    }
  }
  return UserProfileSchema.parse(merged);
}

export async function getCachedProfile(): Promise<UserProfile | null> {
  const raw = await getLocal<unknown>(KEYS.profile);
  if (!raw) return applyProfileDefaults({});
  const parsed = UserProfileSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(SCOPE, "Invalid cached profile — clearing", parsed.error);
    await chrome.storage.local.remove(KEYS.profile);
    return applyProfileDefaults({});
  }
  return applyProfileDefaults(parsed.data);
}

export async function saveCachedProfile(profile: UserProfile): Promise<void> {
  const parsed = UserProfileSchema.parse(profile);
  await setLocal(KEYS.profile, parsed);
}

/** Contact / preference keys the user edits locally — never wiped by resume sync. */
const LOCAL_CONTACT_KEYS: (keyof UserProfile)[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "linkedin",
  "website",
  "location",
  "authorizedToWork",
  "requiresSponsorship",
  "atLeast18",
  "preferredLocation",
  "gender",
  "veteran",
  "race",
  "disability",
  "hearAboutUs",
  "degree",
  "fieldOfStudy",
  "desiredSalary",
  "gpa",
];

/**
 * Merge a remote resume-derived profile with locally saved contact fields.
 * Local contact wins when set so /extension/profile cannot blank name/email.
 */
export function mergeProfiles(
  remote: UserProfile,
  local: UserProfile | null,
): UserProfile {
  if (!local) return applyProfileDefaults(UserProfileSchema.parse(remote));
  const merged: UserProfile = { ...remote };
  for (const key of LOCAL_CONTACT_KEYS) {
    const localVal = local[key];
    if (localVal === undefined || localVal === null || localVal === "") continue;
    Object.assign(merged, { [key]: localVal });
  }
  return applyProfileDefaults(UserProfileSchema.parse(merged));
}

/* -------------------------------------------------------------------------- */
/* Recent applications                                                        */
/* -------------------------------------------------------------------------- */

export async function getRecentApplications(): Promise<RecentApplication[]> {
  const raw = await getLocal<unknown>(KEYS.recentApplications);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => RecentApplicationSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
}

export async function pushRecentApplication(app: RecentApplication): Promise<void> {
  const current = await getRecentApplications();
  const next = [app, ...current].slice(0, 50);
  await setLocal(KEYS.recentApplications, next);
}

/* -------------------------------------------------------------------------- */
/* Learned field mappings (ATS + label → profile field, no values)            */
/* -------------------------------------------------------------------------- */

export async function getFieldMappings(): Promise<FieldMappingsStore> {
  const raw = await getLocal<unknown>(KEYS.fieldMappings);
  if (!raw || typeof raw !== "object") return {};
  const parsed = FieldMappingsStoreSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(SCOPE, "Invalid field mappings — clearing", parsed.error);
    await chrome.storage.local.remove(KEYS.fieldMappings);
    return {};
  }
  return parsed.data;
}

export async function saveFieldMappings(
  store: FieldMappingsStore,
): Promise<void> {
  const parsed = FieldMappingsStoreSchema.parse(store);
  await setLocal(KEYS.fieldMappings, parsed);
}

/* -------------------------------------------------------------------------- */
/* Convenience                                                                */
/* -------------------------------------------------------------------------- */

export async function clearAllStorage(): Promise<void> {
  await chrome.storage.local.clear();
  logger.info(SCOPE, "All local storage cleared");
}

export function onSettingsChanged(
  callback: (settings: ExtensionSettings) => void,
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    const change = changes[KEYS.settings];
    if (area !== "local" || !change) return;
    const parsed = ExtensionSettingsSchema.safeParse(change.newValue);
    if (parsed.success) callback(parsed.data);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
