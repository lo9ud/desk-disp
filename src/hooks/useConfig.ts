import { useSyncExternalStore } from "react";
import type { Config } from "../ffi_types";
import { useRuntime } from "../runtime/context";

/**
 * Live view of the backend config, shared by every consumer in this window.
 *
 * The snapshot and its listener set used to be module-level bindings here, seeded
 * on first import. They now belong to `runtime.config`, so a second runtime gets
 * its own rather than inheriting whatever the first one happened to have loaded.
 */
export default function useConfig(): Config | null {
  const { config } = useRuntime();
  return useSyncExternalStore(config.subscribe, config.current, () => null);
}
