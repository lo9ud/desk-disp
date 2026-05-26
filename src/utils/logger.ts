import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

// Levels at or above this are forwarded to the Rust backend (and written to file).
// Keep at "info" by default to avoid trace/debug noise in the log file.
let backendMinLevel: LogLevel = "info";



const CONSOLE_FN: Record<LogLevel, (...args: unknown[]) => void> = {
  trace: console.debug,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

const {info, debug} = logger("logger");
info(`Logger initialized, backend log level: ${backendMinLevel}`);
// Get the log level from the backend config on startup, and update `backendMinLevel`.
invoke<string>("get_log_level").then((level: string) => {
  let _level = level.toLowerCase();
  if (typeof _level === "string" && _level in LEVEL_ORDER) {
    setBackendMinLevel(_level as LogLevel);
  } else {
    console.warn(`Invalid log level from backend: ${level}`);
  }
}).catch((err) => {
  console.warn(`Failed to get log level from backend, using default "${backendMinLevel}": ${err}`);
});
export function setBackendMinLevel(level: LogLevel) {
  debug(`Updating backend log level to: ${level}`);
  backendMinLevel = level;
}



function timestamp(): string {
  const now = new Date();
  return now.toISOString().replace("T", " ").slice(0, 23) + "Z";
}

function formatLine(level: LogLevel, module: string, message: string, hint?: string): string {
  const body = hint ? `${message} | ${hint}` : message;
  return `[${timestamp()}] [${level.toUpperCase().padEnd(5)}] [${module}] ${body}`;
}

function emit(level: LogLevel, module: string, message: string, hint?: string): void {
  CONSOLE_FN[level](formatLine(level, module, message, hint));

  if (LEVEL_ORDER[level] >= LEVEL_ORDER[backendMinLevel]) {
    invoke("log_from_frontend", { level, module, message, hint }).catch(() => {
      // Backend not ready yet (e.g. very early startup) — silently drop.
      console.warn(`Failed to send log to backend, level=${level}, module=${module}, message=${message}`);
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
