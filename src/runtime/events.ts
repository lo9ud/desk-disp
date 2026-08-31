import type {
  Config,
  CpuStats,
  MemoryStats,
  DiskInfo,
  NetworkInterfaceInfo,
  MediaState,
  FrequencyReading,
  LayoutFile,
  Preferences,
  WidgetConfig,
  StreamName,
} from "../ffi_types";
import type { Transport } from "./transport";

export type { StreamName } from "../ffi_types";

export type BackendEvents = {
  "stream::cpu": CpuStats;
  "stream::memory": MemoryStats;
  "stream::disks": DiskInfo[];
  "stream::networks": NetworkInterfaceInfo[];
  "stream::media": MediaState;
  "stream::visualizer": FrequencyReading[];
  "config::changed": Config;
  "theme::changed": { id: string; css: string };
  "layout::changed": { id: string; layout: LayoutFile };
  "widget::updated": { id: string; config: WidgetConfig };
  "preferences::changed": Preferences;
  "preferences::preview": Preferences;
};

export const EVENT_NAMES = [
  "stream::cpu",
  "stream::memory",
  "stream::disks",
  "stream::networks",
  "stream::media",
  "stream::visualizer",
  "config::changed",
  "theme::changed",
  "layout::changed",
  "widget::updated",
  "preferences::changed",
  "preferences::preview",
] as const satisfies readonly (keyof BackendEvents)[];

export type StreamEvents = { [K in StreamName]: BackendEvents[`stream::${K}`] };

/**
 * Typed backend-event listener in the ordinary JS shape: subscribe returns an
 * unsubscribe function, both synchronous. The transport's `listen` is async, so
 * every call site used to carry a `.then((fn) => (unlisten = fn))` dance plus a
 * cancelled flag; the bus absorbs that once.
 *
 * Read-only by design. Emitting is available on the transport for tests and
 * relays, but is deliberately not surfaced here: cross-window state travels
 * through a backend-emitted event, never a front-to-front one.
 */
export interface EventBus {
  on<K extends keyof BackendEvents>(
    event: K,
    handler: (payload: BackendEvents[K]) => void,
  ): () => void;
}

export function makeEventBus(transport: Transport): EventBus {
  return {
    on(event, handler) {
      let unlisten: (() => void) | null = null;
      let cancelled = false;

      transport
        .listen(event, handler as (payload: unknown) => void)
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        });

      return () => {
        cancelled = true;
        unlisten?.();
        unlisten = null;
      };
    },
  };
}
