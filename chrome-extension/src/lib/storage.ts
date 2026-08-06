/**
 * Typed Chrome Storage wrappers.
 *
 * All persistent extension state flows through these helpers so callers never
 * touch `chrome.storage` directly and Zod always validates on read.
 */

import {
  DEFAULT_SETTINGS,
  ExtensionSettingsSchema,
  RecentApplicationSchema,
  UserProfileSchema,
  type ExtensionSettings,
  type RecentApplication,
  type UserProfile,
} from "@/types";
import { logger } from "@/lib/logger";

const SCOPE = "storage";

const KEYS = {
  settings: "settings",
  profile: "profile",
  recentApplications: "recentApplications",
} as const;

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

export async function getCachedProfile(): Promise<UserProfile | null> {
  const raw = await getLocal<unknown>(KEYS.profile);
  if (!raw) return null;
  const parsed = UserProfileSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(SCOPE, "Invalid cached profile — clearing", parsed.error);
    await chrome.storage.local.remove(KEYS.profile);
    return null;
  }
  return parsed.data;
}

export async function saveCachedProfile(profile: UserProfile): Promise<void> {
  const parsed = UserProfileSchema.parse(profile);
  await setLocal(KEYS.profile, parsed);
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
