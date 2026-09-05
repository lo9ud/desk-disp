import { cliArgs } from "../runtime/cliArgs";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Log sink, installed by the runtime at construction.
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
 * Lines emitted before a sink existed.
 */
const preRuntime: BufferedLine[] = [];

const MAX_BUFFERED = 500;
let bufferedDropped = 0;

const BUFFERED_HINT = "buffered pre-runtime";

export function setLogTransport(transport: {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}) {
  sink = (cmd, args) => transport.invoke(cmd, args);
  flushPreRuntime();
}

function flushPreRuntime() {
  const queued = preRuntime.splice(0, preRuntime.length);
  const dropped = bufferedDropped;
  bufferedDropped = 0;
  for (const line of queued) {
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

/**
 * The level the backend's own subscriber is filtering at, so we don't print lines to the devtools that are below the set log level
 */
const backendMinLevel: LogLevel = cliArgs().log_level;

const CONSOLE_FN: Record<LogLevel, (...args: unknown[]) => void> = {
  trace: console.debug,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

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

  // The console half above is unconditional; only the backend hop is filtered.
  if (LEVEL_ORDER[level] < LEVEL_ORDER[backendMinLevel]) return;

  if (!sink) {
    if (preRuntime.length < MAX_BUFFERED) {
      preRuntime.push({ level, module, message, hint });
    } else {
      bufferedDropped++;
    }
    return;
  }

  send(level, module, message, hint);
}

export interface Logger {
  trace(this:void, message: string, hint?: string): void;
  debug(this:void, message: string, hint?: string): void;
  info(this:void, message: string, hint?: string): void;
  warn(this:void, message: string, hint?: string): void;
  error(this:void, message: string, hint?: string): void;
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
