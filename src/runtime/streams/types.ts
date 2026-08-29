import type { StreamName } from "../../ffi_types";
import type { StreamEvents } from "../events";

/**
 * A source of continuously-pushed backend data, in the ordinary JS listener
 * shape: subscribe returns a synchronous unsubscribe.
 *
 * Two implementations — `BackendStreamHub` over real IPC and `MockStreamHub` over
 * generated data — and nothing above this interface can tell them apart. That is
 * what replaced `useSubscription`'s "am I inside a preview?" context check: a
 * preview runtime is built with a different `StreamSource`, and no consumer
 * branches.
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
