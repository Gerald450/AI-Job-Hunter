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

import { autofillFields, applyAiAutofillValues, confirmAiSuggestion } from "@/content/autofill";
import {
  detectAts,
  detectFieldsForPage,
  didStepChange,
  extractJobForPage,
  invalidateJobCache,
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
import { mountActionBar, type ActionDef } from "@/content/ui/action-bar";
import {
  hideAnalysisPanel,
  showAnalysisError,
  showAnalysisLoading,
  showAnalysisResult,
  type AnalysisPanelHandlers,
} from "@/content/ui/analysis-panel";
import {
  hideAutofillSummary,
  showAutofillAiError,
  showAutofillAiLoading,
  showAutofillAiResult,
  showAutofillSummary,
} from "@/content/ui/autofill-summary";
import { findResumeInput, uploadResume, type ResumePayload } from "@/content/uploader";
import {
  buildJobFromOverride,
  FALLBACK_GUIDANCE,
  getSelectedText,
  HIGHLIGHT_GUIDANCE,
  isDomDescriptionUsable,
  MIN_MANUAL_DESCRIPTION_CHARS,
  validateJobDescriptionText,
} from "@/content/selection";
import {
  applyLearnedMappings,
  rememberMappingsForFields,
} from "@/lib/field-learning";
import {
  formatAutomationError,
  type AutomationResult,
} from "@/lib/automation";
import { logger } from "@/lib/logger";
import {
  collectUnresolvedFields,
  matchFieldToProfile,
  resolveAutofillValues,
  serializeUnresolvedFields,
} from "@/lib/mapping";
import { findElement } from "@/content/detector";
import type {
  AutofillResponse,
  AutofillValue,
  DescriptionSource,
  DetectedField,
  ExtensionMessage,
  ExtensionResponse,
  ExtensionSettings,
  JobAnalysisResponse,
  JobExtraction,
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
    automationUrl: "http://localhost:8090",
    apiKey: "",
    jwt: "",
    resumeId: "",
    resumeFilename: "",
    autoFillEnabled: true,
    autoUploadResume: true,
    autoAnswerQuestions: true,
    playwrightFallbackEnabled: true,
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

    // Learned mappings first (no LLM)
    const learned = await applyLearnedMappings(ats, fields, profile);
    if (learned.length) {
      backendValues = [...learned, ...backendValues];
    }

    // Optional non-AI backend autofill (future rule-based); never calls Groq
    const autofillRes = await send<AutofillResponse>({
      type: "BACKEND_REQUEST",
      payload: {
        action: "autofill",
        payload: { fields, job, profile },
      },
    });

    if (autofillRes.ok && autofillRes.data) {
      backendValues = [...backendValues, ...autofillRes.data.values];
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

    let resumeUploadFailed = false;
    let resumePayload: ResumePayload | null = null;
    if (settings.autoUploadResume && settings.resumeId) {
      const hasFileField = fields.some(
        (f) => f.type === "file" || f.canonicalKey === "resume" || f.category === "resume",
      );
      // Prefer live DOM scan — detectors used to miss visually-hidden file inputs.
      const hasFileInput = Boolean(findResumeInput()) || hasFileField;
      if (hasFileInput) {
        const resumeRes = await send<ResumePayload>({ type: "UPLOAD_RESUME" });
        if (resumeRes.ok && resumeRes.data) {
          resumePayload = resumeRes.data;
          const uploaded = uploadResume(resumeRes.data);
          if (uploaded.ok) {
            showToast({ kind: "success", title: "Resume Uploaded" });
          } else {
            resumeUploadFailed = true;
            showToast({
              kind: "warning",
              title: "Resume Upload Failed",
              message: uploaded.error,
            });
          }
        } else {
          resumeUploadFailed = true;
          showToast({
            kind: "warning",
            title: "Missing Resume",
            message: resumeRes.error || "Configure a resume in Settings.",
          });
        }
      }
    }

    let unresolved = collectUnresolvedFields(fields, fill);
    const needsPlaywright =
      settings.playwrightFallbackEnabled &&
      (unresolved.length > 0 || resumeUploadFailed || result.failed > 0);

    // Playwright is NEVER first — only after the content-script engine tried.
    if (needsPlaywright) {
      const pw = await runPlaywrightFallback({
        ats,
        fields,
        unresolved,
        fill,
        profile,
        settings,
        resumePayload,
        resumeUploadFailed,
        silent: true,
      });
      if (pw.ok) {
        // Re-scan remaining gaps after automation
        unresolved = collectUnresolvedFields(fields, fill);
        if (unresolved.length === 0) {
          hideAutofillSummary();
          showToast({
            kind: "success",
            title: "Autofill Complete",
            message: `Filled ${result.filled}+ via automation`,
          });
          return { ok: true, data: { ats, ...result, unresolved: 0, playwright: true } };
        }
      } else if (pw.error && !/unreachable|network/i.test(pw.error)) {
        // Surface actionable CDP / captcha errors; stay quiet if automation is offline
        logger.warn(SCOPE, "Playwright fallback failed", pw.error);
      }
    }

    showToast({
      kind: "success",
      title: "Autofill Complete",
      message: `Filled ${result.filled} · Review ${result.reviewed}`,
    });

    if (unresolved.length === 0 && !resumeUploadFailed) {
      hideAutofillSummary();
      return { ok: true, data: { ats, ...result, unresolved: 0 } };
    }

    // Opt-in AI / manual Playwright — never called automatically for AI
    showAutofillSummary(
      result.filled,
      unresolved.map((f) => f.label || f.name || f.id || "Field"),
      {
        onUseAi: () =>
          runAiAutofillFallback({
            ats,
            fields,
            unresolved,
            profile,
            job,
            settings,
          }),
        onUsePlaywright: settings.playwrightFallbackEnabled
          ? () => {
              void runPlaywrightFallback({
                ats,
                fields,
                unresolved,
                fill,
                profile,
                settings,
                resumePayload,
                resumeUploadFailed,
                silent: false,
              });
            }
          : undefined,
        onReview: () => {
          for (const f of unresolved) {
            const el = findElement(f);
            if (el) {
              el.classList.add("aijh-review");
              el.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }
        },
        onCancel: () => hideAutofillSummary(),
      },
    );

    return {
      ok: true,
      data: { ats, ...result, unresolved: unresolved.length },
    };
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

/**
 * Playwright CDP fallback — only after content-script autofill left gaps.
 * Keeps the same toast/summary UX whether automation or the extension finished the work.
 */
async function runPlaywrightFallback(ctx: {
  ats: string;
  fields: DetectedField[];
  unresolved: DetectedField[];
  fill: AutofillValue[];
  profile: UserProfile | null;
  settings: ExtensionSettings;
  resumePayload: ResumePayload | null;
  resumeUploadFailed: boolean;
  silent: boolean;
}): Promise<{ ok: boolean; error?: string; data?: AutomationResult }> {
  const {
    ats,
    unresolved,
    fill,
    profile,
    settings,
    resumePayload,
    resumeUploadFailed,
    silent,
  } = ctx;

  if (!silent) {
    showAutofillAiLoading(undefined, "Completing with browser automation...");
  }

  const valueByKey = new Map(
    fill
      .filter((v) => v.canonicalKey)
      .map((v) => [v.canonicalKey as string, v.value]),
  );
  const valueByLabel = new Map(
    fill.map((v) => [v.field.toLowerCase(), v.value]),
  );

  const targets = unresolved.map((f) => {
    let value =
      (f.canonicalKey ? valueByKey.get(f.canonicalKey) : undefined) ??
      valueByLabel.get(f.label.toLowerCase());
    if (
      (value === undefined || value === null || value === "") &&
      profile
    ) {
      value = matchFieldToProfile(f, profile) ?? undefined;
    }
    return {
      uid: f.uid,
      selector: f.selector,
      label: f.label,
      placeholder: f.placeholder,
      name: f.name,
      id: f.id,
      role: f.role,
      type: f.type,
      canonicalKey: f.canonicalKey,
      value,
    };
  });

  // Include profile-only fill when unresolved list is empty but upload failed
  const res = await send<AutomationResult>({
    type: "AUTOMATION_REQUEST",
    payload: {
      action: "fallback",
      payload: {
        url: window.location.href,
        tabUrl: window.location.href,
        ats,
        profile,
        fields: targets,
        resumeBase64:
          resumeUploadFailed || unresolved.some((f) => f.type === "file")
            ? resumePayload?.base64
            : undefined,
        resumeFilename: resumePayload?.filename ?? settings.resumeFilename,
        resumeMimeType: resumePayload?.mimeType,
        meta: { source: "extension-fallback", silent },
      },
    },
  });

  if (!res.ok || !res.data) {
    const error =
      res.error ||
      "Playwright automation unavailable. Is automation-backend running on :8090?";
    if (!silent) {
      showAutofillAiError(error);
      showToast({
        kind: "error",
        title: "Automation Failed",
        message: error,
      });
    }
    return { ok: false, error };
  }

  const result = res.data;
  if (!result.success) {
    const message = formatAutomationError(result);
    if (!silent) {
      showAutofillAiError(message);
      showToast({
        kind: "error",
        title:
          result.code === "CDP_UNAVAILABLE"
            ? "Enable Chrome Debugging"
            : result.code === "CAPTCHA_DETECTED"
              ? "CAPTCHA Required"
              : "Automation Failed",
        message: message.slice(0, 280),
      });
    } else if (
      result.code === "CDP_UNAVAILABLE" ||
      result.code === "CAPTCHA_DETECTED"
    ) {
      showToast({
        kind: "warning",
        title:
          result.code === "CDP_UNAVAILABLE"
            ? "Enable Chrome Debugging"
            : "CAPTCHA Required",
        message: message.slice(0, 220),
      });
    }
    return { ok: false, error: message, data: result };
  }

  if (!silent) {
    hideAutofillSummary();
    showToast({
      kind: "success",
      title: "Autofill Complete",
      message: "Remaining fields completed",
    });
  }
  logger.info(SCOPE, "Playwright fallback succeeded", {
    sessionId: result.sessionId,
    ats: result.pageState?.ats,
  });
  return { ok: true, data: result };
}

async function runAiAutofillFallback(ctx: {
  ats: string;
  fields: DetectedField[];
  unresolved: DetectedField[];
  profile: UserProfile | null;
  job: Partial<JobExtraction>;
  settings: ExtensionSettings;
}): Promise<void> {
  const { ats, fields, unresolved, profile, job, settings } = ctx;

  if (!settings.resumeId) {
    showAutofillAiError(
      "No resume configured. Upload one and set resumeId in Options.",
    );
    return;
  }

  showAutofillAiLoading();

  const aiRes = await send<AutofillResponse>({
    type: "BACKEND_REQUEST",
    payload: {
      action: "autofill_ai",
      payload: {
        resumeId: settings.resumeId,
        fields: serializeUnresolvedFields(unresolved),
        profile,
        job: {
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
        },
        ats,
      },
    },
  });

  if (!aiRes.ok || !aiRes.data) {
    showAutofillAiError(
      aiRes.error || "AI autofill failed. Rule-based fills were left unchanged.",
    );
    showToast({
      kind: "warning",
      title: "AI Autofill Unavailable",
      message: aiRes.error || "Try again later.",
    });
    return;
  }

  observer?.pause();
  const aiResult = applyAiAutofillValues(fields, aiRes.data.values);
  observer?.resume();

  const learnedCandidates = aiRes.data.values.filter(
    (v) => v.canonicalKey && v.confidence >= 0.7,
  );
  await rememberMappingsForFields(ats, fields, learnedCandidates);
  await rememberValues(
    fields,
    aiRes.data.values.filter((v) => v.confidence >= 0.7),
  );

  let pendingConfirm = [...aiResult.pendingConfirm];

  const refreshResult = () => {
    showAutofillAiResult(
      {
        aiFilled: aiResult.filled,
        verify: aiResult.verify,
        pendingConfirm,
      },
      {
        onConfirmSuggestion: async (value) => {
          observer?.pause();
          const ok = confirmAiSuggestion(fields, value);
          observer?.resume();
          if (ok && value.canonicalKey) {
            await rememberMappingsForFields(ats, fields, [value]);
            await rememberValues(fields, [value]);
          }
          pendingConfirm = pendingConfirm.filter(
            (p) => p.field !== value.field || p.uid !== value.uid,
          );
          refreshResult();
        },
        onSkipSuggestion: (value) => {
          pendingConfirm = pendingConfirm.filter(
            (p) => p.field !== value.field || p.uid !== value.uid,
          );
          refreshResult();
        },
      },
    );
  };

  refreshResult();

  showToast({
    kind: "success",
    title: "AI Autofill Complete",
    message: `AI filled ${aiResult.filled + aiResult.verify} · Review ${pendingConfirm.length}`,
  });
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

  const { ats, fields } = detectFieldsForPage();
  const fresh = fields.filter((f) => !processed.has(f.uid));
  if (fresh.length === 0) return;

  logger.info(SCOPE, `New fields detected (${fresh.length}) from ${nodes.length} nodes`);

  const profileRes = await send<UserProfile>({ type: "GET_PROFILE" });
  const profile = profileRes.ok ? (profileRes.data ?? null) : null;
  const learned = await applyLearnedMappings(ats, fresh, profile);
  const sessionValues = await restoreSessionValues(fresh);
  const { fill, review } = resolveAutofillValues(
    fresh,
    profile,
    [...learned, ...sessionValues],
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
/* Resume analysis                                                            */
/* -------------------------------------------------------------------------- */

type AnalyzeOptions = {
  refresh?: boolean;
  descriptionOverride?: string;
  descriptionSource?: DescriptionSource;
  /** When true, skip DOM/backend-fetch fallbacks and require validated override. */
  explicitManual?: boolean;
};

let pendingSave:
  | { jobId: string; description: string }
  | null = null;

function isMissingDescriptionError(message: string | undefined): boolean {
  if (!message) return false;
  return /unable to retrieve the job description|description missing|cannot be performed for this job/i.test(
    message,
  );
}

function buildPanelHandlers(options: AnalyzeOptions): AnalysisPanelHandlers {
  return {
    onRetry: () => {
      void runAnalyzeResume({ ...options, refresh: false });
    },
    onRefresh: () => {
      void runAnalyzeResume({ ...options, refresh: true });
    },
    onSaveDescription: async () => {
      if (!pendingSave) return;
      const res = await send({
        type: "BACKEND_REQUEST",
        payload: {
          action: "save_description",
          payload: pendingSave,
        },
      });
      if (!res.ok) {
        showToast({
          kind: "error",
          title: "Save failed",
          message: res.error || "Could not save job description",
        });
        throw new Error(res.error || "Save failed");
      }
      showToast({
        kind: "success",
        title: "Description saved",
        message: "Future analyses will reuse this text.",
      });
      pendingSave = null;
    },
  };
}

async function postAnalyzeJob(params: {
  job: JobExtraction;
  refresh: boolean;
  descriptionSource?: DescriptionSource;
  persistDescription?: boolean;
}): Promise<ExtensionResponse<JobAnalysisResponse>> {
  return send<JobAnalysisResponse>({
    type: "BACKEND_REQUEST",
    payload: {
      action: "job",
      payload: {
        job: params.job,
        refresh: params.refresh,
        descriptionSource: params.descriptionSource,
        persistDescription: params.persistDescription,
      },
    },
  });
}

async function runAnalyzeResume(
  options?: AnalyzeOptions,
): Promise<ExtensionResponse<JobAnalysisResponse>> {
  const refresh = Boolean(options?.refresh);
  const handlers = buildPanelHandlers(options ?? {});
  pendingSave = null;
  showAnalysisLoading(handlers);

  try {
    const settings = await loadSettings();
    if (!settings.resumeId) {
      const msg =
        "No resume configured. Upload via Options (or POST /extension/resumes) and paste the resumeId.";
      showAnalysisError(msg, handlers);
      return { ok: false, error: msg };
    }

    // Explicit selection / clipboard path
    if (options?.explicitManual || options?.descriptionOverride) {
      const validated = validateJobDescriptionText(options.descriptionOverride);
      if (!validated.ok) {
        showAnalysisError(validated.error, handlers);
        return { ok: false, error: validated.error };
      }
      const source: DescriptionSource =
        options.descriptionSource === "clipboard"
          ? "clipboard"
          : "manual_selection";
      const job = buildJobFromOverride(validated.text, source);
      const res = await postAnalyzeJob({
        job,
        refresh,
        descriptionSource: source,
        persistDescription: false,
      });
      return finishAnalyze(res, handlers, validated.text);
    }

    // Default Analyze Resume: DOM → selection (≥300) → backend fetch → guided error
    let job = extractJobForPage({ force: true });
    let descriptionSource: DescriptionSource | undefined = isDomDescriptionUsable(
      job.description,
    )
      ? "dom"
      : undefined;
    let persistDescription: boolean | undefined;
    let descriptionForSave: string | undefined = job.description;

    if (!descriptionSource) {
      const selection = getSelectedText();
      const validated = validateJobDescriptionText(selection);
      if (validated.ok) {
        job = buildJobFromOverride(validated.text, "manual_selection");
        descriptionSource = "manual_selection";
        persistDescription = false;
        descriptionForSave = validated.text;
      } else {
        // Strip weak scrape so the backend can try DB / ATS fetch.
        job = {
          ...job,
          description: undefined,
          requirements: undefined,
          responsibilities: undefined,
        };
        descriptionForSave = undefined;
      }
    }

    let res = await postAnalyzeJob({
      job,
      refresh,
      descriptionSource,
      persistDescription,
    });

    if (
      !res.ok &&
      isMissingDescriptionError(res.error) &&
      descriptionSource !== "manual_selection"
    ) {
      const selection = getSelectedText();
      const validated = validateJobDescriptionText(selection);
      if (validated.ok) {
        job = buildJobFromOverride(validated.text, "manual_selection");
        res = await postAnalyzeJob({
          job,
          refresh,
          descriptionSource: "manual_selection",
          persistDescription: false,
        });
        return finishAnalyze(res, handlers, validated.text);
      }
      const msg = FALLBACK_GUIDANCE;
      showAnalysisError(msg, handlers);
      return { ok: false, error: msg };
    }

    if (!res.ok || !res.data) {
      const msg =
        isMissingDescriptionError(res.error)
          ? FALLBACK_GUIDANCE
          : res.error || "Resume analysis failed";
      showAnalysisError(msg, handlers);
      return { ok: false, error: msg };
    }

    return finishAnalyze(res, handlers, descriptionForSave);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Resume analysis failed";
    logger.error(SCOPE, "Analyze resume failed", err);
    showAnalysisError(msg, handlers);
    return { ok: false, error: msg };
  }
}

function finishAnalyze(
  res: ExtensionResponse<JobAnalysisResponse>,
  handlers: AnalysisPanelHandlers,
  descriptionForSave?: string,
): ExtensionResponse<JobAnalysisResponse> {
  if (!res.ok || !res.data) {
    const msg =
      isMissingDescriptionError(res.error)
        ? FALLBACK_GUIDANCE
        : res.error || "Resume analysis failed";
    showAnalysisError(msg, handlers);
    return { ok: false, error: msg };
  }

  if (
    res.data.canSaveDescription &&
    res.data.jobId &&
    descriptionForSave &&
    descriptionForSave.trim().length >= MIN_MANUAL_DESCRIPTION_CHARS
  ) {
    pendingSave = {
      jobId: res.data.jobId,
      description: descriptionForSave.trim(),
    };
  } else {
    pendingSave = null;
  }

  showAnalysisResult(res.data, handlers);
  return { ok: true, data: res.data };
}

async function runAnalyzeSelection(
  providedText?: string,
): Promise<ExtensionResponse<JobAnalysisResponse>> {
  const text = providedText ?? getSelectedText();
  const validated = validateJobDescriptionText(text);
  if (!validated.ok) {
    const handlers = buildPanelHandlers({
      explicitManual: true,
      descriptionSource: "manual_selection",
    });
    showAnalysisError(validated.error, handlers);
    return { ok: false, error: validated.error };
  }
  return runAnalyzeResume({
    refresh: false,
    descriptionOverride: validated.text,
    descriptionSource: "manual_selection",
    explicitManual: true,
  });
}

async function runAnalyzeClipboard(
  providedText?: string,
): Promise<ExtensionResponse<JobAnalysisResponse>> {
  let text = providedText ?? "";
  if (!text) {
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      const msg =
        "Could not read clipboard. Allow clipboard access or paste via a page that permits it.";
      logger.warn(SCOPE, msg, err);
      const handlers = buildPanelHandlers({
        explicitManual: true,
        descriptionSource: "clipboard",
      });
      showAnalysisError(msg, handlers);
      return { ok: false, error: msg };
    }
  }
  const validated = validateJobDescriptionText(text);
  if (!validated.ok) {
    const handlers = buildPanelHandlers({
      explicitManual: true,
      descriptionSource: "clipboard",
    });
    showAnalysisError(HIGHLIGHT_GUIDANCE, handlers);
    return { ok: false, error: HIGHLIGHT_GUIDANCE };
  }
  return runAnalyzeResume({
    refresh: false,
    descriptionOverride: validated.text,
    descriptionSource: "clipboard",
    explicitManual: true,
  });
}

function mountPageActions(): void {
  // Show on known ATS pages, or when the page already looks like a job posting
  // (custom career sites such as lifeattiktok.com before/without an adapter).
  const ats = detectAts();
  if (ats === "unknown") {
    const probe = extractJobForPage();
    const selectionOk =
      getSelectedText().trim().length >= MIN_MANUAL_DESCRIPTION_CHARS;
    if (
      !isDomDescriptionUsable(probe.description) &&
      !selectionOk
    ) {
      hideAnalysisPanel();
      return;
    }
  }

  const actions: ActionDef[] = [
    {
      id: "analyze",
      label: "Analyze Resume",
      primary: true,
      onClick: async () => {
        await runAnalyzeResume({ refresh: false });
      },
    },
    {
      id: "analyze_selection",
      label: "Analyze Selected Text",
      onClick: async () => {
        await runAnalyzeSelection();
      },
    },
    {
      id: "analyze_clipboard",
      label: "Analyze from Clipboard",
      onClick: async () => {
        await runAnalyzeClipboard();
      },
    },
    {
      id: "autofill",
      label: "Auto Fill",
      onClick: async () => {
        // Route through background so the frame with the real form is chosen
        // (ATS apps often live in iframes; AI sidebars live on the top page).
        const res = await send({ type: "AUTOFILL_PAGE" });
        if (!res.ok) {
          showToast({
            kind: "warning",
            title: "Autofill Failed",
            message: res.error || "Could not fill this page.",
          });
        }
      },
    },
    {
      id: "copy_description",
      label: "Copy Job Description",
      onClick: async () => {
        const job = extractJobForPage();
        if (!job.description) {
          showToast({
            kind: "warning",
            title: "Nothing to copy",
            message: "No description found on this page.",
          });
          return;
        }
        await navigator.clipboard.writeText(job.description);
        showToast({ kind: "success", title: "Description copied" });
      },
    },
    {
      id: "save",
      label: "Save Job",
      enabled: false,
      onClick: () => undefined,
    },
    {
      id: "cover_letter",
      label: "Generate Cover Letter",
      enabled: false,
      onClick: () => undefined,
    },
    {
      id: "recruiter_message",
      label: "Generate Recruiter Message",
      enabled: false,
      onClick: () => undefined,
    },
    {
      id: "sponsorship",
      label: "View Sponsorship Analysis",
      enabled: false,
      onClick: () => undefined,
    },
    {
      id: "history",
      label: "View Resume Match History",
      enabled: false,
      onClick: () => undefined,
    },
  ];

  mountActionBar(actions);
}

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
          case "ANALYZE_JOB": {
            const payload = (message.payload ?? {}) as { refresh?: boolean };
            sendResponse(await runAnalyzeResume({ refresh: payload.refresh }));
            break;
          }
          case "ANALYZE_SELECTION": {
            const payload = (message.payload ?? {}) as { text?: string };
            sendResponse(await runAnalyzeSelection(payload.text));
            break;
          }
          case "ANALYZE_CLIPBOARD": {
            const payload = (message.payload ?? {}) as { text?: string };
            sendResponse(await runAnalyzeClipboard(payload.text));
            break;
          }
          case "GET_PAGE_SELECTION": {
            const text = getSelectedText();
            sendResponse({
              ok: true,
              data: {
                text,
                length: text.trim().length,
                usable: text.trim().length >= MIN_MANUAL_DESCRIPTION_CHARS,
              },
            });
            break;
          }
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
        invalidateJobCache();
        if (window === window.top) mountPageActions();
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

    // Action bar / SPA hooks only in the top frame — autofill still runs in
    // whichever frame background selects (see AUTOFILL_PAGE).
    if (window === window.top) {
      mountPageActions();
    }
  } catch (err) {
    logger.error(SCOPE, "Boot failed", err);
  }
}

void boot();

export type { DetectedField };
