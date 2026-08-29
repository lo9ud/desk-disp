import type { StreamName } from "../../ffi_types";
import type { StreamIoCommands } from "../commands/streamIo";
import type { EventBus, StreamEvents } from "../events";
import { logger } from "../../utils/logger";
import type { StreamSource } from "./types";

const log = logger("streams");

type AnyHandler = (value: unknown) => void;

interface Entry {
  handlers: Set<AnyHandler>;
  latest: unknown;
  /** What we want the backend state to be. */
  desired: boolean;
  /** What we have most recently told the backend. */
  applied: boolean;
  /** A reconcile pass is already running for this stream. */
  syncing: boolean;
  unlisten: (() => void) | null;
}

/**
 * Owns subscriber counting for the whole window, and keeps exactly one backend
 * hint and one event listener per stream no matter how many widgets are watching.
 *
 * Counting lives here rather than in Rust because this is the only side that can
 * observe mount and unmount ordering accurately; the backend gets a coarse
 * per-window "wanted / not wanted" hint instead of a running total it has to keep
 * in step across an async boundary.
 *
 * All backend traffic for a stream goes through `reconcile`, a serialized
 * desired-vs-applied loop. A rapid subscribe → unsubscribe → subscribe therefore
 * settles on the correct final state instead of racing: intermediate flips are
 * coalesced, and the listener can never be registered twice or torn down while
 * still wanted.
 */
export class BackendStreamHub implements StreamSource {
  private readonly entries = new Map<StreamName, Entry>();
  private disposed = false;
  /**
   * Clearing this window's stale hints is part of construction, and every
   * reconcile waits on it. Without that ordering a widget subscribing on the
   * first frame could have its `start_stream` wiped by the `reset_streams` that
   * was still in flight behind it.
   */
  private readonly ready: Promise<void>;

  constructor(
    private readonly io: StreamIoCommands,
    private readonly events: EventBus,
  ) {
    this.ready = io.reset().catch((err) => {
      log.warn("reset_streams failed at startup", String(err));
    });
  }

  private entry(name: StreamName): Entry {
    let e = this.entries.get(name);
    if (!e) {
      e = {
        handlers: new Set(),
        latest: null,
        desired: false,
        applied: false,
        syncing: false,
        unlisten: null,
      };
      this.entries.set(name, e);
    }
    return e;
  }

  private emit(e: Entry, value: unknown) {
    e.latest = value;
    e.handlers.forEach((h) => h(value));
  }

  private async reconcile(name: StreamName): Promise<void> {
    const e = this.entry(name);
    if (e.syncing) return; // the running pass will pick up the new target
    e.syncing = true;
    try {
      await this.ready;
      while (e.desired !== e.applied && !this.disposed) {
        const target = e.desired;
        if (target) {
          // Listener first: a frame emitted between start_stream landing and the
          // listener registering would otherwise be dropped.
          e.unlisten = this.events.on(`stream::${name}`, (value) =>
            this.emit(e, value),
          );
          const last = await this.io.start<unknown>(name);
          // dispose() ran while the start was in flight, so it iterated this
          // entry before the listener existed and could not tear it down.
          if (this.disposed) {
            e.unlisten?.();
            e.unlisten = null;
            void this.io.stop(name);
            return;
          }
          // Only seed from the cache if nothing live has arrived meanwhile —
          // otherwise a fresh frame would be replaced by an older one.
          if (last !== null && last !== undefined && e.latest === null) {
            this.emit(e, last);
          }
        } else {
          e.unlisten?.();
          e.unlisten = null;
          await this.io.stop(name);
        }
        e.applied = target;
      }
    } catch (err) {
      log.warn(`stream "${name}" reconcile failed`, String(err));
    } finally {
      e.syncing = false;
      // A flip that arrived while we were awaiting is handled here rather than by
      // the caller, so no transition can be silently dropped.
      if (e.desired !== e.applied && !this.disposed) void this.reconcile(name);
    }
  }

  subscribe<K extends StreamName>(
    name: K,
    handler: (value: StreamEvents[K]) => void,
  ): () => void {
    const e = this.entry(name);
    const fn = handler as AnyHandler;
    e.handlers.add(fn);
    if (e.handlers.size === 1) {
      e.desired = true;
      void this.reconcile(name);
    }

    let released = false;
    return () => {
      if (released) return; // unsubscribing twice must not decrement twice
      released = true;
      e.handlers.delete(fn);
      if (e.handlers.size === 0) {
        e.desired = false;
        void this.reconcile(name);
      }
    };
  }

  latest<K extends StreamName>(name: K): StreamEvents[K] | null {
    return (this.entries.get(name)?.latest ?? null) as StreamEvents[K] | null;
  }

  dispose(): void {
    this.disposed = true;
    for (const [name, e] of this.entries) {
      e.handlers.clear();
      e.unlisten?.();
      e.unlisten = null;
      if (e.applied) void this.io.stop(name);
    }
    this.entries.clear();
  }
}
