export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Log sink, installed by the runtime at construction.
 *
 * The `logger(module)` factory below stays module-level on purpose: it is a
 * diagnostic sink rather than data access, and ~10 modules call it at import time
 * where no runtime exists yet. What DI buys here is only that this file no longer
 * reaches for `invoke` itself — lines emitted before the runtime exists go to the
 * console and are dropped from the backend log, which is the same behaviour the
 * old "backend not ready yet" catch produced.
 */
type LogSink = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

let sink: LogSink | null = null;

export function setLogTransport(transport: {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}) {
  sink = (cmd, args) => transport.invoke(cmd, args);
  // Deferred until there is something to ask: the backend's level is what decides
  // whether a line is worth shipping at all.
  syncBackendLevel();
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

let backendMinLevel: LogLevel = "info";
let logLevelSynced = false;

const CONSOLE_FN: Record<LogLevel, (...args: unknown[]) => void> = {
  trace: console.debug,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

const { info, debug } = logger("logger");

/** Reads the backend's configured level once, so we don't ship lines it will drop. */
function syncBackendLevel() {
  if (logLevelSynced || !sink) return;
  logLevelSynced = true;
  sink("get_log_level", {})
    .then((level) => {
      const _level = String(level).toLowerCase();
      if (_level in LEVEL_ORDER) {
        info(`Backend log level: ${_level}`);
        setBackendMinLevel(_level as LogLevel);
      } else {
        console.warn(`Invalid log level from backend: ${level}`);
      }
    })
    .catch((err) => {
      console.warn(
        `Failed to get log level from backend, using default "${backendMinLevel}": ${err}`,
      );
    });
}
export function setBackendMinLevel(level: LogLevel) {
  debug(`Updating backend log level to: ${level}`);
  backendMinLevel = level;
}

function timestamp(): string {
  const now = new Date();
  return now.toISOString().replace("T", " ").slice(0, 23) + "Z";
}

function formatLine(
  level: LogLevel,
  module: string,
  message: string,
  hint?: string,
): string {
  const body = hint ? `${message} | ${hint}` : message;
  return `[${timestamp()}] [${level.toUpperCase().padEnd(5)}] [${module}] ${body}`;
}

function emit(
  level: LogLevel,
  module: string,
  message: string,
  hint?: string,
): void {
  CONSOLE_FN[level](formatLine(level, module, message, hint));

  if (sink && LEVEL_ORDER[level] >= LEVEL_ORDER[backendMinLevel]) {
    sink("log_from_frontend", { level, module, message, hint }).catch(() => {
      // Backend not ready yet (e.g. very early startup) — silently drop.
      console.warn(
        `Failed to send log to backend, level=${level}, module=${module}, message=${message}`,
      );
    });
  }
}

export interface Logger {
  trace(message: string, hint?: string): void;
  debug(message: string, hint?: string): void;
  info(message: string, hint?: string): void;
  warn(message: string, hint?: string): void;
  error(message: string, hint?: string): void;
}

/**
 * Returns a logger scoped to `module`. Use the module name or component name
 * as the argument so log lines are grep-able by source.
 *
 * @example
 * const log = logger("MediaControlWidget");
 * log.info("Playback started", "track: Never Gonna Give You Up");
 * log.error("Album art fetch failed", err.message);
 */
export function logger(module: string): Logger {
  return {
    trace: (msg, hint) => emit("trace", module, msg, hint),
    debug: (msg, hint) => emit("debug", module, msg, hint),
    info: (msg, hint) => emit("info", module, msg, hint),
    warn: (msg, hint) => emit("warn", module, msg, hint),
    error: (msg, hint) => emit("error", module, msg, hint),
  };
}
