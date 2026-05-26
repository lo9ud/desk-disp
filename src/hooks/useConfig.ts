import { useSyncExternalStore } from "react";
import type { Config } from "../ffi_types";
import { ipc, ipcListen } from "../ipc";

/* Module-level store so all consumers share the same snapshot */

let snapshot: Config | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): Config | null {
  return snapshot;
}

// Seed the store on first import and keep it live via config::changed
let initialized = false;
function ensureInit() {
  if (initialized) return;
  initialized = true;

  ipc.getConfig().then((config) => {
    snapshot = config;
    notify();
  });

  ipcListen("config::changed", (config) => {
    snapshot = config;
    notify();
  });
}

export default function useConfig(): Config | null {
  ensureInit();
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
