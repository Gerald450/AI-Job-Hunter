/**
 * Structured Playwright logging.
 *
 * Example:
 *   [Playwright] Connected to Chrome
 *   [Playwright] Detected Workday
 */

import type { AutomationLogEntry } from "./types.js";

export type LogLevel = AutomationLogEntry["level"];

export class AutomationLogger {
  private entries: AutomationLogEntry[] = [];
  private readonly prefix = "[Playwright]";

  getLogs(): AutomationLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  private write(level: LogLevel, message: string, detail?: unknown): void {
    const entry: AutomationLogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
      detail,
    };
    this.entries.push(entry);

    const line = `${this.prefix} ${message}`;
    if (level === "error") {
      console.error(line, detail ?? "");
    } else if (level === "warn") {
      console.warn(line, detail ?? "");
    } else if (level === "debug") {
      console.debug(line, detail ?? "");
    } else {
      console.info(line, detail ?? "");
    }
  }

  debug(message: string, detail?: unknown): void {
    this.write("debug", message, detail);
  }

  info(message: string, detail?: unknown): void {
    this.write("info", message, detail);
  }

  warn(message: string, detail?: unknown): void {
    this.write("warn", message, detail);
  }

  error(message: string, detail?: unknown): void {
    this.write("error", message, detail);
  }
}

/** Shared process-wide logger for helpers that don't own a session. */
export const globalLogger = new AutomationLogger();
