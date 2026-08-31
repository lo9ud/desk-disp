import type { Config, Preferences } from "../../ffi_types";
import type { EventBus } from "../events";
import type { Transport } from "../transport";

/**
 * Config commands plus the live snapshot every consumer shares.
 *
 * The snapshot used to be three module-level bindings in `hooks/useConfig.ts`
 * (`snapshot`/`listeners`/`initialized`); it now belongs to the runtime, so a
 * second runtime (preview, test) gets its own rather than inheriting whatever
 * the real one happened to have loaded.
 */
export interface ConfigCommands {
  get(): Promise<Config>;
  setPreferences(prefs: Preferences): Promise<void>;
  previewPreferences(prefs: Preferences): Promise<void>;

  /** Latest known config, or null before the first load resolves. */
  current(): Config | null;
  /** useSyncExternalStore-shaped subscription to `current()`. */
  subscribe(onChange: () => void): () => void;
}

export function makeConfigCommands(
  t: Transport,
  events: EventBus,
): ConfigCommands {
  let snapshot: Config | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  // Seeded on first subscribe rather than at construction: a preview runtime
  // has no backend behind its transport, and nothing in a preview reads config,
  // so an eager `get_config` there would only produce a rejected promise.
  let started = false;
  function ensureStarted() {
    if (started) return;
    started = true;
    t.invoke<Config>("get_config").then((config) => {
      snapshot = config;
      notify();
    });
    events.on("config::changed", (config) => {
      snapshot = config;
      notify();
    });
  }

  return {
    get: () => t.invoke<Config>("get_config"),
    setPreferences: (prefs) => t.invoke<void>("set_preferences", { prefs }),
    previewPreferences: (prefs) =>
      t.invoke<void>("preview_preferences", { prefs }),

    current: () => snapshot,
    subscribe(onChange) {
      ensureStarted();
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
