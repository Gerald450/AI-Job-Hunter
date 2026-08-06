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
  requestAutofill,
} from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  getCachedProfile,
  getSettings,
  saveCachedProfile,
  saveSettings,
} from "@/lib/storage";
import type {
  DetectedField,
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  ExtensionStatus,
  JobExtraction,
  ToastPayload,
} from "@/types";

const SCOPE = "background";

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

async function boot(): Promise<void> {
  const settings = await getSettings();
  logger.configure({ verbose: settings.debugLogging });
  logger.info(SCOPE, "Service worker started", {
    backendUrl: settings.backendUrl,
  });
}

void boot();

chrome.runtime.onInstalled.addListener((details) => {
  logger.info(SCOPE, `Installed (${details.reason})`);
  if (details.reason === "install") {
    void chrome.runtime.openOptionsPage();
  }
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
        const profile = await fetchProfile(settings);
        await saveCachedProfile(profile);
        return { ok: true, data: profile };
      } catch (err) {
        const cached = await getCachedProfile();
        if (cached) return { ok: true, data: cached };
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
        await ensureContentScript(tabId);
        const result = await chrome.tabs.sendMessage(tabId, {
          type: "AUTOFILL_PAGE",
        } satisfies ExtensionMessage);
        return result as ExtensionResponse;
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
        // Ask content script to extract job metadata, then score via backend
        const extraction = (await chrome.tabs.sendMessage(tabId, {
          type: "ANALYZE_JOB",
        } satisfies ExtensionMessage)) as ExtensionResponse<JobExtraction>;

        if (!extraction.ok || !extraction.data) {
          return extraction;
        }

        const analysis = await analyzeJob(extraction.data);
        await chrome.tabs.sendMessage(tabId, {
          type: "SHOW_TOAST",
          payload: {
            kind: "success",
            title: "Qualification Score Ready",
            message: `Score: ${analysis.score}/100`,
          } satisfies ToastPayload,
        } satisfies ExtensionMessage);

        return { ok: true, data: analysis };
      } catch (err) {
        return fail(err);
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
        action: "autofill" | "questions" | "profile" | "job";
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
          case "questions":
            return {
              ok: true,
              data: await answerQuestions(payload as DetectedField[]),
            };
          case "profile":
            return { ok: true, data: await fetchProfile() };
          case "job":
            return {
              ok: true,
              data: await analyzeJob(payload as JobExtraction),
            };
          default:
            return { ok: false, error: `Unknown backend action: ${action}` };
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
    target: { tabId },
    files: contentJs,
  });

  // Brief wait for the listener to register
  await new Promise((r) => setTimeout(r, 150));
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
