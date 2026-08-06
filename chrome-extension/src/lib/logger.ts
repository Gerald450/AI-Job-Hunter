/**
 * Centralized logging for the extension.
 *
 * Respects the `debugLogging` setting — debug messages are suppressed unless
 * verbose mode is enabled. All levels are forwarded to the background worker
 * when running outside the service worker context so logs stay in one place.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let verbose = false;
let minLevel: LogLevel = "info";

const PREFIX = "[AIJH]";

export function configureLogger(options: {
  verbose?: boolean;
  minLevel?: LogLevel;
}): void {
  if (options.verbose !== undefined) verbose = options.verbose;
  if (options.minLevel) minLevel = options.minLevel;
}

function shouldLog(level: LogLevel): boolean {
  if (level === "debug" && !verbose) return false;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function formatArgs(scope: string, message: string, extra?: unknown): unknown[] {
  const stamp = new Date().toISOString().slice(11, 23);
  const head = `${PREFIX} ${stamp} [${scope}] ${message}`;
  return extra === undefined ? [head] : [head, extra];
}

function emit(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  if (!shouldLog(level)) return;
  const args = formatArgs(scope, message, extra);
  switch (level) {
    case "debug":
      console.debug(...args);
      break;
    case "info":
      console.info(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    case "error":
      console.error(...args);
      break;
  }
}

export const logger = {
  debug: (scope: string, message: string, extra?: unknown) =>
    emit("debug", scope, message, extra),
  info: (scope: string, message: string, extra?: unknown) =>
    emit("info", scope, message, extra),
  warn: (scope: string, message: string, extra?: unknown) =>
    emit("warn", scope, message, extra),
  error: (scope: string, message: string, extra?: unknown) =>
    emit("error", scope, message, extra),
  configure: configureLogger,
};

export type Logger = typeof logger;
