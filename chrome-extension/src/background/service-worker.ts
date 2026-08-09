/**
 * Background service worker (Manifest V3).
 *
 * Owns: messaging hub, backend proxy, tab helpers, centralized logging,
 * and extension status aggregation.
 */

import {
  analyzeJob,
  answerQuestions,
  ApiError,
  checkHealth,
  downloadResume,
  fetchProfile,
  requestAiAutofill,
  requestAutofill,
  saveJobDescription,
} from "@/lib/api";
import {
  checkAutomationHealth,
  requestAutomationAction,
  requestAutomationFallback,
  type AutomationFallbackRequest,
} from "@/lib/automation";
import { logger } from "@/lib/logger";
import {
  getCachedProfile,
  getSettings,
  mergeProfiles,
  saveCachedProfile,
  saveSettings,
} from "@/lib/storage";
import type {
  AnalyzeJobPayload,
  DetectedField,
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  ExtensionStatus,
  ToastPayload,
  UserProfile,
} from "@/types";
import { UserProfileSchema } from "@/types";

const SCOPE = "background";
const CONTEXT_MENU_ANALYZE_SELECTION = "aijh-analyze-selection";

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

async function boot(): Promise<void> {
  const settings = await getSettings();
  logger.configure({ verbose: settings.debugLogging });
  logger.info(SCOPE, "Service worker started", {
    backendUrl: settings.backendUrl,
  });
  await ensureContextMenus();
}

void boot();

chrome.runtime.onInstalled.addListener((details) => {
  logger.info(SCOPE, `Installed (${details.reason})`);
  void ensureContextMenus();
  if (details.reason === "install") {
    void chrome.runtime.openOptionsPage();
  }
});

async function ensureContextMenus(): Promise<void> {
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ANALYZE_SELECTION,
      title: "Analyze Highlighted Job Description",
      contexts: ["selection"],
    });
  } catch (err) {
    logger.warn(SCOPE, "Failed to create context menus", err);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ANALYZE_SELECTION) return;
  const tabId = tab?.id;
  if (tabId === undefined) {
    logger.warn(SCOPE, "Context menu click without tab");
    return;
  }
  void (async () => {
    try {
      await ensureContentScript(tabId);
      const result = (await chrome.tabs.sendMessage(tabId, {
        type: "ANALYZE_SELECTION",
        payload: { text: info.selectionText ?? "" },
      } satisfies ExtensionMessage)) as ExtensionResponse;
      if (!result.ok) {
        logger.warn(SCOPE, "ANALYZE_SELECTION failed", result.error);
      }
    } catch (err) {
      logger.error(SCOPE, "Context menu analyze failed", err);
    }
  })();
});

/* -------------------------------------------------------------------------- */
/* Messaging                                                                  */
/* -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    void handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : "Unknown error";
        logger.error(SCOPE, "Message handler failed", err);
        sendResponse({ ok: false, error });
      });
    // Keep the message channel open for async responses
    return true;
  },
);

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
  logger.debug(SCOPE, `← ${message.type}`, message.payload);

  switch (message.type) {
    case "PING":
      return { ok: true, data: { pong: true } };

    case "GET_SETTINGS":
      return { ok: true, data: await getSettings() };

    case "UPDATE_SETTINGS": {
      const partial = message.payload as Partial<ExtensionSettings>;
      const updated = await saveSettings(partial);
      logger.configure({ verbose: updated.debugLogging });
      return { ok: true, data: updated };
    }

    case "GET_PROFILE": {
      try {
        const settings = await getSettings();
        const cached = await getCachedProfile();
        const remote = await fetchProfile(settings);
        const profile = mergeProfiles(remote, cached);
        await saveCachedProfile(profile);
        return { ok: true, data: profile };
      } catch (err) {
        const cached = await getCachedProfile();
        if (cached) return { ok: true, data: cached };
        return fail(err);
      }
    }

    case "UPDATE_PROFILE": {
      try {
        const partial = message.payload as Partial<UserProfile>;
        const current = (await getCachedProfile()) ?? {};
        const profile = UserProfileSchema.parse({ ...current, ...partial });
        await saveCachedProfile(profile);
        return { ok: true, data: profile };
      } catch (err) {
        return fail(err);
      }
    }

    case "GET_STATUS":
      return { ok: true, data: await buildStatus(sender.tab?.id) };

    case "OPEN_TAB": {
      const { url } = message.payload as { url: string };
      await chrome.tabs.create({ url });
      return { ok: true };
    }

    case "SHOW_TOAST": {
      // Forward toast to the active tab's content script
      const toast = message.payload as ToastPayload;
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (tabId !== undefined) {
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: "SHOW_TOAST",
            payload: toast,
          } satisfies ExtensionMessage);
        } catch {
          // Content script may not be injected on this page
        }
      }
      return { ok: true };
    }

    case "AUTOFILL_PAGE": {
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (tabId === undefined) {
        return { ok: false, error: "No active tab" };
      }
      try {
        return await runAutofillOnBestFrame(tabId);
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "Content script unavailable on this page",
        };
      }
    }

    case "ANALYZE_JOB": {
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (tabId === undefined) {
        return { ok: false, error: "No active tab" };
      }
      try {
        await ensureContentScript(tabId);
        // Content script extracts JD, calls backend, and renders the in-page panel.
        const result = (await chrome.tabs.sendMessage(tabId, {
          type: "ANALYZE_JOB",
          payload: message.payload ?? { refresh: false },
        } satisfies ExtensionMessage)) as ExtensionResponse;
        return result;
      } catch (err) {
        return fail(err);
      }
    }

    case "ANALYZE_SELECTION": {
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (tabId === undefined) {
        return { ok: false, error: "No active tab" };
      }
      try {
        await ensureContentScript(tabId);
        const result = (await chrome.tabs.sendMessage(tabId, {
          type: "ANALYZE_SELECTION",
          payload: message.payload,
        } satisfies ExtensionMessage)) as ExtensionResponse;
        return result;
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "Cannot inject on this page. Try a normal http(s) job posting.",
        };
      }
    }

    case "ANALYZE_CLIPBOARD": {
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (tabId === undefined) {
        return { ok: false, error: "No active tab" };
      }
      try {
        await ensureContentScript(tabId);
        const result = (await chrome.tabs.sendMessage(tabId, {
          type: "ANALYZE_CLIPBOARD",
          payload: message.payload,
        } satisfies ExtensionMessage)) as ExtensionResponse;
        return result;
      } catch (err) {
        return fail(err);
      }
    }

    case "GET_PAGE_SELECTION": {
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (tabId === undefined) {
        return { ok: false, error: "No active tab" };
      }
      try {
        await ensureContentScript(tabId);
        const result = (await chrome.tabs.sendMessage(tabId, {
          type: "GET_PAGE_SELECTION",
        } satisfies ExtensionMessage)) as ExtensionResponse;
        return result;
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "Content script unavailable on this page",
        };
      }
    }

    case "DETECT_FIELDS": {
      const fields = message.payload as DetectedField[];
      logger.info(SCOPE, `Detected ${fields.length} fields from tab ${sender.tab?.id}`);
      return { ok: true };
    }

    case "UPLOAD_RESUME": {
      try {
        const fileMeta = await downloadResume();
        // Content script performs the actual DOM attach; we return a data URL
        const buffer = await fileMeta.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        return {
          ok: true,
          data: {
            filename: fileMeta.name,
            mimeType: fileMeta.type,
            base64,
          },
        };
      } catch (err) {
        return fail(err);
      }
    }

    case "BACKEND_REQUEST": {
      const { action, payload } = message.payload as {
        action:
          | "autofill"
          | "autofill_ai"
          | "questions"
          | "profile"
          | "job"
          | "save_description";
        payload: unknown;
      };
      try {
        switch (action) {
          case "autofill":
            return {
              ok: true,
              data: await requestAutofill(
                payload as Parameters<typeof requestAutofill>[0],
              ),
            };
          case "autofill_ai":
            return {
              ok: true,
              data: await requestAiAutofill(
                payload as Parameters<typeof requestAiAutofill>[0],
              ),
            };
          case "questions":
            return {
              ok: true,
              data: await answerQuestions(payload as DetectedField[]),
            };
          case "profile":
            return { ok: true, data: await fetchProfile() };
          case "job": {
            const body = payload as AnalyzeJobPayload;
            return {
              ok: true,
              data: await analyzeJob(body.job, {
                refresh: body.refresh,
                descriptionSource: body.descriptionSource,
                persistDescription: body.persistDescription,
              }),
            };
          }
          case "save_description": {
            const body = payload as { jobId: string; description: string };
            await saveJobDescription(body.jobId, body.description);
            return { ok: true };
          }
          default:
            return { ok: false, error: `Unknown backend action: ${action}` };
        }
      } catch (err) {
        return fail(err);
      }
    }

    case "AUTOMATION_REQUEST": {
      const { action, payload } = message.payload as {
        action: "fallback" | "health" | "continue" | "stop" | "fill" | "upload";
        payload?: AutomationFallbackRequest;
      };
      try {
        const settings = await getSettings();
        switch (action) {
          case "health":
            return { ok: true, data: await checkAutomationHealth(settings) };
          case "fallback":
            return {
              ok: true,
              data: await requestAutomationFallback(
                payload as AutomationFallbackRequest,
                settings,
              ),
            };
          case "continue":
          case "stop":
          case "fill":
          case "upload":
            return {
              ok: true,
              data: await requestAutomationAction(
                action,
                (payload ?? {}) as AutomationFallbackRequest,
                settings,
              ),
            };
          default:
            return { ok: false, error: `Unknown automation action: ${action}` };
        }
      } catch (err) {
        return fail(err);
      }
    }

    case "LOG": {
      const { level, scope, message: msg, extra } = message.payload as {
        level: "debug" | "info" | "warn" | "error";
        scope: string;
        message: string;
        extra?: unknown;
      };
      logger[level](scope, msg, extra);
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unhandled message type: ${message.type}` };
  }
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

async function buildStatus(tabId?: number): Promise<ExtensionStatus> {
  const settings = await getSettings();
  const profile = await getCachedProfile();
  const backendOnline = await checkHealth(settings);

  let ats: ExtensionStatus["ats"];
  if (tabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(tabId);
      ats = detectAtsFromUrl(tab.url ?? "");
    } catch {
      /* tab may have closed */
    }
  }

  return {
    connected: true,
    backendOnline,
    loggedIn: Boolean(settings.jwt || settings.apiKey),
    userEmail: profile?.email || undefined,
    resumeLoaded: Boolean(settings.resumeId),
    resumeFilename: settings.resumeFilename || undefined,
    ats,
    autoFillEnabled: settings.autoFillEnabled,
  };
}

function detectAtsFromUrl(url: string): ExtensionStatus["ats"] {
  try {
    const host = new URL(url).hostname;
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("ashbyhq.com")) return "ashby";
    if (host.includes("workable.com")) return "workable";
    if (
      host.includes("myworkdayjobs.com") ||
      host.includes("workdayjobs.com") ||
      /\.wd\d+\./i.test(host)
    ) {
      return "workday";
    }
    if (host.includes("smartrecruiters.com")) return "smartrecruiters";
    if (host.includes("icims.com")) return "icims";
    if (host.includes("oraclecloud.com")) return "oracle";
    if (host.includes("taleo.")) return "taleo";
    if (host.includes("successfactors.") || host.includes("sapsf.com")) {
      return "successfactors";
    }
    if (host.includes("jobvite.com")) return "jobvite";
    if (host.includes("teamtailor.com")) return "teamtailor";
    if (host.includes("bamboohr.")) return "bamboohr";
    if (host.includes("recruitee.com")) return "recruitee";
    if (
      host.includes("lifeattiktok.com") ||
      host.includes("jobs.bytedance.com")
    ) {
      return "lifeattiktok";
    }
  } catch {
    /* invalid url */
  }
  return "unknown";
}

/**
 * Ensure the content script is running on `tabId`.
 * Known ATS hosts get auto-injection via manifest; unknown career portals are
 * injected on demand so the generic engine works everywhere.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" } satisfies ExtensionMessage);
    return;
  } catch {
    // Not injected yet
  }

  // Programmatic injection — works with activeTab / host_permissions.
  // Chrome only accepts .js files; the built dist/manifest rewrites .ts → assets/*.js.
  const manifest = chrome.runtime.getManifest();
  const contentJs = (manifest.content_scripts?.[0]?.js ?? []).filter((f) =>
    f.endsWith(".js"),
  );
  if (!contentJs.length) {
    throw new Error(
      "No compiled content script found. Load the unpacked extension from chrome-extension/dist (run pnpm build first), not the source folder.",
    );
  }

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: contentJs,
  });

  // Brief wait for the listener to register
  await new Promise((r) => setTimeout(r, 150));
}

/**
 * Probe every frame for real form inputs, then run autofill in the best one.
 * Avoids top-frame AI sidebars winning chrome.tabs.sendMessage's first-response race.
 */
async function runAutofillOnBestFrame(tabId: number): Promise<ExtensionResponse> {
  await ensureContentScript(tabId);

  let ranked: number[] = [];
  try {
    const probes = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const noise =
          /deepseek|chatgpt|claude|gemini|copilot|grammarly|monica|sider|merlin|ai[-_]?sidebar/i;
        const nodes = Array.from(
          document.querySelectorAll(
            "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), textarea, select",
          ),
        );
        let score = 0;
        for (const node of nodes) {
          const el = node as HTMLElement;
          const blob = [
            el.id,
            typeof el.className === "string" ? el.className : "",
            el.getAttribute("aria-label") || "",
            el.getAttribute("name") || "",
          ].join(" ");
          if (noise.test(blob)) continue;
          if (el.closest("form, main, [role='main']")) score += 3;
          else score += 1;
        }
        return score;
      },
    });
    ranked = probes
      .map((p) => ({ frameId: p.frameId, score: Number(p.result) || 0 }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((p) => p.frameId);
  } catch (err) {
    logger.warn(SCOPE, "Frame probe failed; falling back to main frame", err);
  }

  const candidates = ranked.length > 0 ? ranked : [0];
  let last: ExtensionResponse = { ok: false, error: "No fields detected" };

  for (const frameId of candidates) {
    try {
      const result = (await chrome.tabs.sendMessage(
        tabId,
        { type: "AUTOFILL_PAGE" } satisfies ExtensionMessage,
        { frameId },
      )) as ExtensionResponse;
      last = result;
      if (result.ok) return result;
      if (result.error && /disabled/i.test(result.error)) return result;
      if (result.error && /already in progress/i.test(result.error)) return result;
      // Try next frame when this one has no usable fields
      if (result.error && /no fields/i.test(result.error)) continue;
      // Non-empty failure with data still preferable to silence
      if (result.ok === false && !/no fields/i.test(result.error || "")) {
        // Keep trying higher-score frames only for "no fields"
        continue;
      }
    } catch {
      continue;
    }
  }

  return last;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function getActiveTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

function fail(err: unknown): ExtensionResponse {
  if (err instanceof ApiError) {
    return { ok: false, error: err.message };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Unknown error",
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
