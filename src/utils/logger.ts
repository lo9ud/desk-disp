export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Log sink, installed by the runtime at construction.
 *
 * The `logger(module)` factory below stays module-level on purpose: it is a
 * diagnostic sink rather than data access, and ~10 modules call it at import time
 * where no runtime exists yet. What DI buys here is only that this file no longer
 * reaches for `invoke` itself — lines emitted before the runtime exists are held
 * in `preRuntime` below and flushed once it is, so registration-time diagnostics
 * (see defRegistry's checkPresets) reach the log file instead of the devtools
 * console alone.
 */
type LogSink = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;

let sink: LogSink | null = null;

type BufferedLine = {
  level: LogLevel;
  module: string;
  message: string;
  hint?: string;
};

/**
 * Lines emitted before a sink existed. Only the backend hop is deferred — the
 * console half of `emit` always runs immediately, with the correct frontend
 * timestamp.
 */
const preRuntime: BufferedLine[] = [];

/**
 * Realistically unreachable (module init emits a few dozen lines), so this is
 * only here to stop an app that never installs a transport from growing the
 * buffer forever. Earliest lines win: they are the startup ones worth having.
 */
const MAX_BUFFERED = 500;
let bufferedDropped = 0;

/**
 * Marks a flushed line's leading timestamp as a receipt time rather than an
 * emission time. Deliberately not the emission timestamp itself: the frontend
 * and backend stamp on different clocks, so a precise-looking frontend time
 * sitting in a backend-stamped log invites a comparison that doesn't hold. That
 * the line was buffered at all is the part worth knowing.
 */
const BUFFERED_HINT = "buffered pre-runtime";

export function setLogTransport(transport: {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}) {
  sink = (cmd, args) => transport.invoke(cmd, args);
  // Before syncBackendLevel, and synchronous: nothing can emit between
  // installing the sink and draining the queue, so a buffered line can never be
  // overtaken by a live one. Waiting for the real backend level first would
  // keep pre-runtime `debug` lines that the default "info" filter drops here,
  // but it costs an IPC round-trip during which live lines would jump the
  // queue — and those dropped lines are still in the console either way.
  flushPreRuntime();
  // Deferred until there is something to ask: the backend's level is what decides
  // whether a line is worth shipping at all.
  syncBackendLevel();
}

function flushPreRuntime() {
  const queued = preRuntime.splice(0, preRuntime.length);
  const dropped = bufferedDropped;
  bufferedDropped = 0;
  for (const line of queued) {
    if (LEVEL_ORDER[line.level] < LEVEL_ORDER[backendMinLevel]) continue;
    send(line.level, line.module, line.message, taggedHint(line.hint));
  }
  if (dropped > 0) {
    // Safe to go through the normal path: `sink` is set by now, so this takes
    // the direct branch rather than re-entering the buffer.
    logger("logger").warn(
      `Dropped ${dropped} pre-runtime log lines over the ${MAX_BUFFERED}-line buffer cap`,
    );
  }
}

function taggedHint(hint: string | undefined): string {
  return hint ? `${hint} | ${BUFFERED_HINT}` : BUFFERED_HINT;
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

function send(
  level: LogLevel,
  module: string,
  message: string,
  hint?: string,
): void {
  sink!("log_from_frontend", { level, module, message, hint }).catch(() => {
    console.warn(
      `Failed to send log to backend, level=${level}, module=${module}, message=${message}`,
    );
  });
}

function emit(
  level: LogLevel,
  module: string,
  message: string,
  hint?: string,
): void {
  CONSOLE_FN[level](formatLine(level, module, message, hint));

  if (!sink) {
    // Level-filtered at flush, not here: `backendMinLevel` is still the default
    // until the backend answers, so filtering now would use the same value
    // twice over, and holding the line keeps the decision in one place.
    if (preRuntime.length < MAX_BUFFERED) {
      preRuntime.push({ level, module, message, hint });
    } else {
      bufferedDropped++;
    }
    return;
  }

  if (LEVEL_ORDER[level] >= LEVEL_ORDER[backendMinLevel]) {
    send(level, module, message, hint);
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
