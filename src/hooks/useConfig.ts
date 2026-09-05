import { useSyncExternalStore } from "react";
import type { Config } from "../ffi_types";
import { useRuntime } from "../runtime/context";

/**
 * Live view of the backend config, shared by every consumer in this window.
 */
export default function useConfig(): Config | null {
  const { config } = useRuntime();
  return useSyncExternalStore(config.subscribe.bind(config), config.current.bind(config), () => null);
}
