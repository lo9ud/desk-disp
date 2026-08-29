import type { StreamName } from "../../ffi_types";
import type { Transport } from "../transport";

/**
 * Raw stream lifecycle hints. Subscriber counting is the frontend hub's job
 * (see `BackendStreamHub`); these three only tell the backend whether this
 * window currently wants a stream at all, and are advisory — the backend may
 * keep a stream alive past a `stop`.
 */
export interface StreamIoCommands {
  /** Returns the last cached frame, if the backend has emitted one. */
  start<T>(channel: StreamName): Promise<T | null>;
  stop(channel: StreamName): Promise<void>;
  /** Drops every hint this window holds. Called once at hub construction. */
  reset(): Promise<void>;
}

export function makeStreamIoCommands(t: Transport): StreamIoCommands {
  return {
    start: <T,>(channel: StreamName) =>
      t.invoke<T | null>("start_stream", { channel }),
    stop: (channel) => t.invoke<void>("stop_stream", { channel }),
    reset: () => t.invoke<void>("reset_streams"),
  };
}
