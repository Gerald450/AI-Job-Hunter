/**
 * Content script entry point.
 *
 * Pipeline (generic-first):
 *   Detect ATS (optional)
 *        ↓
 *   Generic Field Detection Engine
 *        ↓
 *   Adapter enrichment (optional)
 *        ↓
 *   Normalize → common schema
 *        ↓
 *   Backend autofill values (+ session restore for multi-page)
 *        ↓
 *   Shared autofill engine + resume upload
 *        ↓
 *   Highlight uncertain fields
 *
 * Works on known ATS hosts and any unknown career portal (via scripting injection).
 */

import { autofillFields } from "@/content/autofill";
import {
  detectFieldsForPage,
  didStepChange,
  extractJobForPage,
} from "@/content/ats";
import {
  createProcessedTracker,
  observeFormMutations,
} from "@/content/observers";
import {
  rememberValues,
  restoreSessionValues,
} from "@/content/session";
import { showToast } from "@/content/toast";
import { uploadResume, type ResumePayload } from "@/content/uploader";
import { logger } from "@/lib/logger";
import { resolveAutofillValues } from "@/lib/mapping";
import type {
  AutofillResponse,
  AutofillValue,
  DetectedField,
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  QuestionsResponse,
  ToastPayload,
  UserProfile,
} from "@/types";

const SCOPE = "content";

const processed = createProcessedTracker();
let settingsCache: ExtensionSettings | null = null;
let running = false;
let lastUrl = window.location.href;

/* -------------------------------------------------------------------------- */
/* Messaging helpers                                                          */
/* -------------------------------------------------------------------------- */

function send<T = unknown>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: ExtensionResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }
      resolve(response ?? { ok: false, error: "Empty response" });
    });
  });
}

async function loadSettings(): Promise<ExtensionSettings> {
  const res = await send<ExtensionSettings>({ type: "GET_SETTINGS" });
  if (res.ok && res.data) {
    settingsCache = res.data;
    logger.configure({ verbose: res.data.debugLogging });
    return res.data;
  }
  return {
    backendUrl: "http://localhost:8000",
    apiKey: "",
    jwt: "",
    resumeId: "",
    resumeFilename: "",
    autoFillEnabled: true,
    autoUploadResume: true,
    autoAnswerQuestions: true,
    darkMode: false,
    debugLogging: false,
    dashboardUrl: "http://localhost:3000",
    confidenceThreshold: 0.9,
  };
}

/* -------------------------------------------------------------------------- */
/* Core autofill pipeline                                                     */
/* -------------------------------------------------------------------------- */

async function runAutofillPipeline(): Promise<ExtensionResponse> {
  if (running) {
    return { ok: false, error: "Autofill already in progress" };
  }
  running = true;

  try {
    const settings = await loadSettings();
    if (!settings.autoFillEnabled) {
      showToast({
        kind: "warning",
        title: "Auto Fill Disabled",
        message: "Enable it in Settings to continue.",
      });
      return { ok: false, error: "Auto fill disabled" };
    }

    // Generic engine (+ optional adapter enrich + normalize)
    const { ats, fields } = detectFieldsForPage();
    logger.info(SCOPE, `ATS=${ats}, fields=${fields.length}`, {
      canonicalized: fields.filter((f) => f.canonicalKey).length,
    });

    if (fields.length === 0) {
      showToast({
        kind: "warning",
        title: "No Form Fields Found",
        message: "Open the application form and try again.",
      });
      return { ok: false, error: "No fields detected" };
    }

    void send({ type: "DETECT_FIELDS", payload: fields });

    const profileRes = await send<UserProfile>({ type: "GET_PROFILE" });
    const profile = profileRes.ok ? (profileRes.data ?? null) : null;

    let backendValues: AutofillValue[] = [];
    const job = extractJobForPage();
    const autofillRes = await send<AutofillResponse>({
      type: "BACKEND_REQUEST",
      payload: {
        action: "autofill",
        payload: { fields, job, profile },
      },
    });

    if (autofillRes.ok && autofillRes.data) {
      backendValues = autofillRes.data.values;
    } else if (autofillRes.error) {
      logger.warn(
        SCOPE,
        "Backend autofill unavailable — using local profile + session",
        autofillRes.error,
      );
      if (/unreachable|network|offline/i.test(autofillRes.error)) {
        showToast({
          kind: "warning",
          title: "Backend Offline",
          message: "Using cached profile.",
        });
      }
    }

    if (settings.autoAnswerQuestions) {
      const qFields = fields.filter((f) => f.category);
      if (qFields.length > 0) {
        const qRes = await send<QuestionsResponse>({
          type: "BACKEND_REQUEST",
          payload: { action: "questions", payload: qFields },
        });
        if (qRes.ok && qRes.data) {
          backendValues = [
            ...backendValues,
            ...qRes.data.answers.map(
              (a): AutofillValue => ({
                field: a.question,
                canonicalKey: a.canonicalKey,
                value: a.answer,
                confidence: a.confidence,
                needsReview: a.confidence < settings.confidenceThreshold,
              }),
            ),
          ];
        }
      }
    }

    // Restore values from prior wizard steps (Workday multi-page, etc.)
    const sessionValues = await restoreSessionValues(fields);
    backendValues = [...sessionValues, ...backendValues];

    const { fill, review } = resolveAutofillValues(
      fields,
      profile,
      backendValues,
      settings.confidenceThreshold,
    );

    observer?.pause();
    const result = autofillFields(fields, fill, review);
    fields.forEach((f) => processed.add(f.uid));
    observer?.resume();

    await rememberValues(fields, fill);

    if (settings.autoUploadResume && settings.resumeId) {
      const hasFile = fields.some(
        (f) => f.type === "file" || f.canonicalKey === "resume" || f.category === "resume",
      );
      if (hasFile) {
        const resumeRes = await send<ResumePayload>({ type: "UPLOAD_RESUME" });
        if (resumeRes.ok && resumeRes.data) {
          const uploaded = uploadResume(resumeRes.data);
          if (uploaded.ok) {
            showToast({ kind: "success", title: "Resume Uploaded" });
          } else {
            showToast({
              kind: "warning",
              title: "Resume Upload Failed",
              message: uploaded.error,
            });
          }
        } else {
          showToast({
            kind: "warning",
            title: "Missing Resume",
            message: resumeRes.error || "Configure a resume in Settings.",
          });
        }
      }
    }

    if (result.missingRequired.length > 0) {
      showToast({
        kind: "warning",
        title: "Missing Required Fields",
        message: result.missingRequired.slice(0, 4).join(", "),
      });
    }

    showToast({
      kind: "success",
      title: "Autofill Complete",
      message: `Filled ${result.filled} · Review ${result.reviewed}`,
    });

    return { ok: true, data: { ats, ...result } };
  } catch (err) {
    logger.error(SCOPE, "Autofill pipeline failed", err);
    showToast({
      kind: "error",
      title: "Autofill Failed",
      message: err instanceof Error ? err.message : "Unexpected error",
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Autofill failed",
    };
  } finally {
    running = false;
  }
}

async function handleNewFields(nodes: Element[]): Promise<void> {
  const settings = settingsCache ?? (await loadSettings());
  if (!settings.autoFillEnabled) return;

  // Multi-page SPA step change — clear processed so new step fields fill
  if (didStepChange(lastUrl)) {
    processed.clear();
    lastUrl = window.location.href;
    logger.info(SCOPE, "Application step change detected");
  }

  const { fields } = detectFieldsForPage();
  const fresh = fields.filter((f) => !processed.has(f.uid));
  if (fresh.length === 0) return;

  logger.info(SCOPE, `New fields detected (${fresh.length}) from ${nodes.length} nodes`);

  const profileRes = await send<UserProfile>({ type: "GET_PROFILE" });
  const profile = profileRes.ok ? (profileRes.data ?? null) : null;
  const sessionValues = await restoreSessionValues(fresh);
  const { fill, review } = resolveAutofillValues(
    fresh,
    profile,
    sessionValues,
    settings.confidenceThreshold,
  );
  if (fill.length === 0 && review.length === 0) return;

  observer?.pause();
  autofillFields(fresh, fill, review);
  fresh.forEach((f) => processed.add(f.uid));
  await rememberValues(fresh, fill);
  observer?.resume();
}

/* -------------------------------------------------------------------------- */
/* Message listener                                                           */
/* -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    void (async () => {
      try {
        switch (message.type) {
          case "AUTOFILL_PAGE":
            sendResponse(await runAutofillPipeline());
            break;
          case "ANALYZE_JOB":
            sendResponse({ ok: true, data: extractJobForPage() });
            break;
          case "DETECT_FIELDS": {
            const { ats, fields } = detectFieldsForPage();
            sendResponse({ ok: true, data: { ats, fields } });
            break;
          }
          case "SHOW_TOAST":
            showToast(message.payload as ToastPayload);
            sendResponse({ ok: true });
            break;
          case "PING":
            sendResponse({ ok: true, data: { ats: detectFieldsForPage().ats } });
            break;
          default:
            sendResponse({ ok: false, error: `Unhandled: ${message.type}` });
        }
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "Content script error",
        });
      }
    })();
    return true;
  },
);

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

let observer: ReturnType<typeof observeFormMutations> | null = null;

async function boot(): Promise<void> {
  try {
    await loadSettings();
    const { ats, fields } = detectFieldsForPage();
    logger.info(SCOPE, `Ready on ${window.location.hostname}`, {
      ats,
      fieldCount: fields.length,
    });

    observer = observeFormMutations((nodes) => {
      void handleNewFields(nodes);
    });

    // Track SPA URL changes for multi-page Workday-style wizards
    const notifyUrl = () => {
      if (window.location.href !== lastUrl) {
        if (didStepChange(lastUrl)) {
          processed.clear();
          logger.info(SCOPE, "URL step change — will refill new fields");
        }
        lastUrl = window.location.href;
      }
    };
    window.addEventListener("popstate", notifyUrl);
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args) => {
      origPush(...args);
      notifyUrl();
    };
    history.replaceState = (...args) => {
      origReplace(...args);
      notifyUrl();
    };
  } catch (err) {
    logger.error(SCOPE, "Boot failed", err);
  }
}

void boot();

export type { DetectedField };
