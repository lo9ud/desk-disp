import type { StreamName } from "../../ffi_types";
import type { StreamEvents } from "../events";

/**
 * A source of continuously-pushed backend data, in the ordinary JS listener
 * shape: subscribe returns a synchronous unsubscribe.
 */
export interface StreamSource {
  subscribe<K extends StreamName>(
    name: K,
    handler: (value: StreamEvents[K]) => void,
  ): () => void;

  /** Most recent frame, or null if none has arrived yet. */
  latest<K extends StreamName>(name: K): StreamEvents[K] | null;

  dispose(): void;
}
