/**
 * Connects to the user's existing Chrome via CDP.
 * Does NOT launch a separate browser per request.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { AutomationLogger, globalLogger } from "./logger.js";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

export class CdpUnavailableError extends Error {
  readonly code = "CDP_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "CdpUnavailableError";
  }
}

export function cdpUrl(): string {
  return (process.env.CDP_URL || DEFAULT_CDP_URL).replace(/\/$/, "");
}

export function cdpHelpMessage(endpoint: string): string {
  return [
    `Chrome is not reachable at ${endpoint}.`,
    "Start Chrome with remote debugging enabled, then retry:",
    "",
    "  macOS:",
    '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-aijh-debug"',
    "",
    "  Or quit Chrome and relaunch with:",
    "  --remote-debugging-port=9222",
    "",
    "Keep using the same profile so you stay logged into ATS portals.",
    `Set CDP_URL if your debugging port differs (current: ${endpoint}).`,
  ].join("\n");
}

export class BrowserManager {
  private browser: Browser | null = null;
  private connecting: Promise<Browser> | null = null;
  private readonly logger: AutomationLogger;

  constructor(logger: AutomationLogger = globalLogger) {
    this.logger = logger;
  }

  isConnected(): boolean {
    return Boolean(this.browser?.isConnected());
  }

  async connect(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.connectOnce();
    try {
      this.browser = await this.connecting;
      return this.browser;
    } finally {
      this.connecting = null;
    }
  }

  private async connectOnce(): Promise<Browser> {
    const endpoint = cdpUrl();
    this.logger.info("Connecting to Chrome", { endpoint });

    try {
      const browser = await chromium.connectOverCDP(endpoint, { timeout: 8_000 });
      this.logger.info("Connected to Chrome");
      browser.on("disconnected", () => {
        this.logger.warn("Chrome CDP disconnected");
        this.browser = null;
      });
      return browser;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error("Failed to connect to Chrome via CDP", detail);
      throw new CdpUnavailableError(cdpHelpMessage(endpoint));
    }
  }

  async getDefaultContext(): Promise<BrowserContext> {
    const browser = await this.connect();
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      // Rare with connectOverCDP — create a blank context if needed
      this.logger.warn("No browser contexts found — creating one");
      return browser.newContext();
    }
    return contexts[0]!;
  }

  /**
   * Prefer reusing the tab that matches `preferredUrl` (or current session URL).
   * Falls back to the first non-devtools page, then creates a new tab.
   */
  async getOrCreatePage(preferredUrl?: string): Promise<Page> {
    const context = await this.getDefaultContext();
    const pages = context.pages().filter((p) => {
      const u = p.url();
      return !u.startsWith("devtools://") && !u.startsWith("chrome-extension://");
    });

    if (preferredUrl) {
      const match = pages.find((p) => urlsLooselyMatch(p.url(), preferredUrl));
      if (match) {
        this.logger.info("Reusing current tab", { url: match.url() });
        await match.bringToFront().catch(() => undefined);
        return match;
      }
    }

    if (pages.length > 0) {
      const page = pages[0]!;
      this.logger.info("Reusing existing tab", { url: page.url() });
      await page.bringToFront().catch(() => undefined);
      return page;
    }

    this.logger.info("Creating new tab");
    return context.newPage();
  }

  async disconnect(): Promise<void> {
    // Do not close the user's Chrome — only drop our CDP connection handle.
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        /* ignore */
      }
      this.browser = null;
      this.logger.info("Disconnected from Chrome (browser left running)");
    }
  }
}

function urlsLooselyMatch(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.origin === ub.origin &&
      ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "")
    );
  } catch {
    return a === b;
  }
}

/** Singleton used by the HTTP server. */
export const browserManager = new BrowserManager();
