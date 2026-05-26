import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BackendEvents } from "./events";

export function ipcListen<K extends keyof BackendEvents>(
  event: K,
  handler: (payload: BackendEvents[K]) => void,
): Promise<UnlistenFn> {
  return listen<BackendEvents[K]>(event, (e) => handler(e.payload));
}
