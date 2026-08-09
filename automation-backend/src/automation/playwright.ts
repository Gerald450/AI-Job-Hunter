/**
 * Playwright orchestration — maps REST actions onto session + ATS adapters.
 *
 * Extension remains primary; this layer only runs when the content script
 * cannot complete an action (custom dropdowns, shadow DOM, uploads, etc.).
 */

import { detectAts } from "./adapters/index.js";
import { browserManager, CdpUnavailableError } from "./browserManager.js";
import { captureFailure } from "./failureCapture.js";
import { safeClick, waitForReact } from "./helpers/index.js";
import { sessionManager, type AutomationSession } from "./sessionManager.js";
import type {
  AutomationAction,
  AutomationRequest,
  AutomationResult,
} from "./types.js";

async function detectCaptcha(session: AutomationSession): Promise<boolean> {
  const page = session.page;
  const hit = await page
    .locator(
      [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        ".g-recaptcha",
        "#captcha",
        '[data-callback*="captcha" i]',
        'text=/verify you are human/i',
      ].join(", "),
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (hit) {
    session.application.captchaPaused = true;
    session.logger.warn(
      "CAPTCHA detected — pausing automation. Complete it in the browser, then continue.",
    );
  }
  return hit;
}

function ok(
  session: AutomationSession,
  partial: Partial<AutomationResult> & { success?: boolean } = {},
): AutomationResult {
  return {
    success: partial.success ?? true,
    sessionId: session.id,
    pageState: {
      url: session.page.url(),
      title: "",
      ats: session.ats,
      step: session.application.stepHistory.at(-1),
    },
    ...partial,
    logs: session.logger.getLogs(),
  };
}

async function withPageState(
  session: AutomationSession,
  result: AutomationResult,
): Promise<AutomationResult> {
  result.pageState = await sessionManager.refreshPageState(session);
  result.logs = session.logger.getLogs();
  result.sessionId = session.id;
  return result;
}

async function fail(
  session: AutomationSession | null,
  err: unknown,
  code: AutomationResult["code"] = "ACTION_FAILED",
): Promise<AutomationResult> {
  const logger = session?.logger;
  logger?.error("Action failed", err instanceof Error ? err.message : String(err));

  const artifacts = session
    ? await captureFailure(session.page, err, session.logger)
    : undefined;

  return {
    success: false,
    error: err instanceof Error ? err.message : String(err),
    code,
    logs: logger?.getLogs() ?? [],
    sessionId: session?.id,
    artifacts: artifacts
      ? { screenshot: artifacts.screenshot, html: artifacts.html }
      : undefined,
    data: artifacts?.stack ? { stack: artifacts.stack } : undefined,
    nextAction: "manual_review",
  };
}

function adapterContext(session: AutomationSession, req: AutomationRequest) {
  return {
    page: session.page,
    logger: session.logger,
    profile: req.profile,
    fields: req.fields,
    resumePath: req.resumePath,
    resumeBase64: req.resumeBase64,
    resumeFilename: req.resumeFilename,
    resumeMimeType: req.resumeMimeType,
  };
}

async function ensureSession(req: AutomationRequest): Promise<AutomationSession> {
  const session = await sessionManager.ensure({
    sessionId: req.sessionId,
    url: req.url,
    tabUrl: req.tabUrl || req.url,
    ats: req.ats,
  });

  const adapter = detectAts(session.page.url(), req.ats ?? session.ats);
  session.ats = adapter.id;
  session.logger.info(`Detected ${capitalize(adapter.id)}`);
  sessionManager.touch(session);
  return session;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export async function runAutomationAction(
  action: AutomationAction,
  req: AutomationRequest,
): Promise<AutomationResult> {
  try {
    if (action === "stop") {
      const existing = sessionManager.get(req.sessionId);
      await sessionManager.stop(req.sessionId);
      if (!browserManager.isConnected() && !existing) {
        return {
          success: true,
          logs: [],
          nextAction: "done",
          data: { stopped: true },
        };
      }
      return {
        success: true,
        logs: existing?.logger.getLogs() ?? [],
        sessionId: req.sessionId,
        nextAction: "done",
        data: { stopped: true },
      };
    }

    // Ensure CDP before anything else
    await browserManager.connect();

    if (action === "start") {
      if (!req.url && !req.tabUrl) {
        return {
          success: false,
          error: "url or tabUrl is required to start automation",
          code: "VALIDATION",
          logs: [],
        };
      }
      const session = await sessionManager.start({
        url: req.url,
        tabUrl: req.tabUrl || req.url,
        sessionId: req.sessionId,
        ats: req.ats,
      });
      const adapter = detectAts(session.page.url(), req.ats);
      session.ats = adapter.id;
      session.logger.info(`Detected ${capitalize(adapter.id)}`);
      await waitForReact(session.page, { logger: session.logger }).catch(() => undefined);

      if (await detectCaptcha(session)) {
        return withPageState(
          session,
          ok(session, {
            success: false,
            error:
              "CAPTCHA detected. Solve it in Chrome, then call /automation/continue.",
            code: "CAPTCHA_DETECTED",
            nextAction: "wait_user",
          }),
        );
      }

      // Optional immediate fill on start when fields/profile provided
      if (req.fields?.length || req.profile) {
        const { filled } = await adapter.fill(adapterContext(session, req));
        session.application.filledFields.push(...filled);
      }

      return withPageState(
        session,
        ok(session, {
          nextAction: "continue",
          data: {
            ats: session.ats,
            application: session.application,
          },
        }),
      );
    }

    const session = await ensureSession(req);
    if (session.application.captchaPaused) {
      // Re-check; user may have solved it
      if (await detectCaptcha(session)) {
        return withPageState(
          session,
          ok(session, {
            success: false,
            error: "CAPTCHA still present — complete it in the browser.",
            code: "CAPTCHA_DETECTED",
            nextAction: "wait_user",
          }),
        );
      }
      session.application.captchaPaused = false;
      session.logger.info("CAPTCHA cleared — resuming");
    }

    if (await detectCaptcha(session)) {
      return withPageState(
        session,
        ok(session, {
          success: false,
          error:
            "CAPTCHA detected. Solve it in Chrome, then call /automation/continue.",
          code: "CAPTCHA_DETECTED",
          nextAction: "wait_user",
        }),
      );
    }

    const adapter = detectAts(session.page.url(), session.ats);
    session.ats = adapter.id;
    const ctx = adapterContext(session, req);

    switch (action) {
      case "detect": {
        return withPageState(
          session,
          ok(session, {
            data: { ats: session.ats },
            nextAction: "fill",
          }),
        );
      }
      case "fill": {
        const { filled } = await adapter.fill(ctx);
        session.application.filledFields.push(...filled);
        session.logger.info(`Filled ${filled.length} field(s)`);
        return withPageState(
          session,
          ok(session, {
            data: { filled },
            nextAction: "continue",
          }),
        );
      }
      case "upload": {
        await adapter.uploadResume(ctx);
        session.application.uploadedResume = true;
        return withPageState(
          session,
          ok(session, {
            data: { uploaded: true },
            nextAction: "continue",
          }),
        );
      }
      case "click": {
        if (!req.clickTarget) {
          return withPageState(
            session,
            ok(session, {
              success: false,
              error: "clickTarget is required",
              code: "VALIDATION",
            }),
          );
        }
        await safeClick(session.page, req.clickTarget, { logger: session.logger });
        return withPageState(session, ok(session, { nextAction: "continue" }));
      }
      case "click_next":
      case "continue": {
        await adapter.clickNext(ctx);
        session.application.stepHistory.push(session.page.url());
        await waitForReact(session.page, { logger: session.logger }).catch(() => undefined);
        return withPageState(
          session,
          ok(session, {
            nextAction: "fill",
            data: { step: session.application.stepHistory.length },
          }),
        );
      }
      case "submit": {
        await adapter.submit(ctx);
        return withPageState(
          session,
          ok(session, {
            nextAction: "done",
            data: { submitted: true },
          }),
        );
      }
      case "extract_questions": {
        const questions = await adapter.extractQuestions(ctx);
        return withPageState(
          session,
          ok(session, {
            data: { questions },
            nextAction: "fill",
          }),
        );
      }
      default:
        return {
          success: false,
          error: `Unsupported action: ${action}`,
          code: "VALIDATION",
          logs: session.logger.getLogs(),
          sessionId: session.id,
        };
    }
  } catch (err) {
    if (err instanceof CdpUnavailableError) {
      return {
        success: false,
        error: err.message,
        code: "CDP_UNAVAILABLE",
        logs: [],
        nextAction: "manual_review",
      };
    }
    const session = sessionManager.get(req.sessionId);
    return fail(session, err, "INTERNAL");
  }
}

/** Convenience: run a fill+upload fallback for unresolved extension fields. */
export async function runFallbackFill(
  req: AutomationRequest,
): Promise<AutomationResult> {
  const start = await runAutomationAction("start", req);
  if (!start.success) return start;

  let result = start;
  if (req.fields?.some((f) => f.value !== undefined) || req.profile) {
    result = await runAutomationAction("fill", {
      ...req,
      sessionId: start.sessionId,
    });
    if (!result.success) return result;
  }

  const needsUpload =
    Boolean(req.resumePath || req.resumeBase64) &&
    (req.fields?.some(
      (f) =>
        f.type === "file" ||
        f.canonicalKey === "resume" ||
        /resume/i.test(f.label ?? ""),
    ) ??
      Boolean(req.resumePath || req.resumeBase64));

  if (needsUpload) {
    result = await runAutomationAction("upload", {
      ...req,
      sessionId: start.sessionId ?? result.sessionId,
    });
  }

  return result;
}
