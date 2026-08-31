import type { Args } from "../ffi_types";

/**
 * The process's parsed CLI arguments, injected into every webview before any
 * page script runs.
 */
declare global {
  interface Window {
    __DESK_DISP_ARGS__?: Args;
  }
}

/**
 * Mirrors clap's own defaults in `cli.rs`.
 */
const DEFAULTS: Args = { dev: false, log_level: "info" };

let resolved: Args | null = null;

/**
 * Read once and memoised: the global is fixed for the life of the process, and
 * the logger consults it on every line.
 */
export function cliArgs(): Args {
  if (resolved) return resolved;
  const injected =
    typeof window === "undefined" ? undefined : window.__DESK_DISP_ARGS__;
  resolved = injected || DEFAULTS;
  return resolved;
}
