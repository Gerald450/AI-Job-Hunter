/**
 * Persistent Playwright session — reuses browser / context / page across actions.
 * Supports multiple named sessions for future parallel automation.
 */

import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { browserManager } from "./browserManager.js";
import { AutomationLogger } from "./logger.js";
import type {
  ApplicationState,
  AtsPlatform,
  PageState,
} from "./types.js";

export interface AutomationSession {
  id: string;
  page: Page;
  logger: AutomationLogger;
  ats: AtsPlatform;
  currentUrl: string;
  currentTab: string;
  application: ApplicationState;
  createdAt: string;
}

function emptyApplication(): ApplicationState {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    lastActionAt: now,
    filledFields: [],
    uploadedResume: false,
    stepHistory: [],
    captchaPaused: false,
  };
}

export class SessionManager {
  private readonly sessions = new Map<string, AutomationSession>();
  private defaultSessionId: string | null = null;

  get(sessionId?: string): AutomationSession | null {
    if (sessionId) return this.sessions.get(sessionId) ?? null;
    if (this.defaultSessionId) {
      return this.sessions.get(this.defaultSessionId) ?? null;
    }
    return null;
  }

  list(): AutomationSession[] {
    return [...this.sessions.values()];
  }

  async start(options: {
    url?: string;
    tabUrl?: string;
    sessionId?: string;
    ats?: AtsPlatform;
  }): Promise<AutomationSession> {
    const preferred = options.tabUrl || options.url;
    const page = await browserManager.getOrCreatePage(preferred);

    if (options.url) {
      const current = page.url();
      if (!urlsRelated(current, options.url)) {
        await page.goto(options.url, { waitUntil: "domcontentloaded" });
      }
    }

    const id = options.sessionId || randomUUID();
    // Replace prior session with same id
    await this.stop(id, { silent: true });

    const logger = new AutomationLogger();
    logger.info("Session started", { sessionId: id, url: page.url() });

    const session: AutomationSession = {
      id,
      page,
      logger,
      ats: options.ats ?? "unknown",
      currentUrl: page.url(),
      currentTab: page.url(),
      application: emptyApplication(),
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(id, session);
    this.defaultSessionId = id;
    return session;
  }

  /**
   * Ensure a live session exists; reconnect/reuse page when possible.
   */
  async ensure(options: {
    sessionId?: string;
    url?: string;
    tabUrl?: string;
    ats?: AtsPlatform;
  }): Promise<AutomationSession> {
    const existing = this.get(options.sessionId);
    if (existing && !existing.page.isClosed()) {
      existing.application.lastActionAt = new Date().toISOString();
      existing.currentUrl = existing.page.url();
      existing.currentTab = existing.page.url();
      if (options.ats && options.ats !== "unknown") {
        existing.ats = options.ats;
      }
      return existing;
    }
    return this.start(options);
  }

  touch(session: AutomationSession): void {
    session.application.lastActionAt = new Date().toISOString();
    session.currentUrl = session.page.url();
    session.currentTab = session.page.url();
  }

  pageState(session: AutomationSession): PageState {
    return {
      url: session.page.url(),
      title: "", // filled async by callers when needed
      ats: session.ats,
      step: session.application.stepHistory.at(-1),
    };
  }

  async refreshPageState(session: AutomationSession): Promise<PageState> {
    this.touch(session);
    let title = "";
    try {
      title = await session.page.title();
    } catch {
      /* ignore */
    }
    return {
      url: session.page.url(),
      title,
      ats: session.ats,
      step: session.application.stepHistory.at(-1),
    };
  }

  async stop(sessionId?: string, opts?: { silent?: boolean }): Promise<void> {
    const id = sessionId ?? this.defaultSessionId;
    if (!id) return;
    const session = this.sessions.get(id);
    if (!session) return;
    if (!opts?.silent) {
      session.logger.info("Session stopped", { sessionId: id });
    }
    this.sessions.delete(id);
    if (this.defaultSessionId === id) {
      this.defaultSessionId = this.sessions.keys().next().value ?? null;
    }
    // Do not close the page — user may still be filling / reviewing.
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      await this.stop(id);
    }
  }
}

function urlsRelated(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin;
  } catch {
    return a === b;
  }
}

export const sessionManager = new SessionManager();
