import { use } from "react";
import { logger } from "../../utils/logger";
import type { PersistenceBackend } from "./backend";

const log = logger("persistence_store");

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Listener = () => void;

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Rides out spurious IO failures — notably a read racing `file.rs::write_raw`'s
 * fixed-name `.json.tmp` rename. Wraps individual IO steps only, never a
 * caller's fallback producer: that may have side effects and must run at most
 * once.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await fn();
      log.trace(`withRetry: succeeded on attempt ${attempt + 1}/${RETRY_ATTEMPTS}`);
      return result;
    } catch (err) {
      lastError = err;
      log.debug(`withRetry: attempt ${attempt + 1}/${RETRY_ATTEMPTS} failed`, describeError(err));
      if (attempt < RETRY_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  log.debug(`withRetry: all ${RETRY_ATTEMPTS} attempts failed, rethrowing`, describeError(lastError));
  throw lastError;
}

interface SuspenseEntry {
  promise: Promise<unknown>;
  failed: boolean;
}

/** Thrown when a post-gate read finds nothing. See `PersistenceStore.read`. */
export class PersistenceInvariantError extends Error {
  constructor(cacheKey: string) {
    super(
      `persistence: "${cacheKey}" was read after its Suspense gate resolved, but no value is cached. ` +
        `This is a bug in the persistence layer, not a loading state.`,
    );
    this.name = "PersistenceInvariantError";
  }
}

/**
 * The shared in-memory cache, retry policy, Suspense gating and error bookkeeping
 * for widget persistence.
 *
 * Was a set of module-level `Map`s; now an instantiable class owned by the
 * runtime. Deliberately still *one shared instance per runtime* rather than one
 * per widget — group scopes exist precisely so several widgets read and write the
 * same data, and per-widget partitioning would destroy that. What scopes access
 * is the handle bound to a widget's own scope, not a separate store.
 */
export class PersistenceStore {
  private readonly cache = new Map<string, unknown>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly suspenseEntries = new Map<string, SuspenseEntry>();
  private readonly errors = new Map<string, unknown>();

  constructor(readonly backend: PersistenceBackend) {}

  private notify(cacheKey: string) {
    this.listeners.get(cacheKey)?.forEach((cb) => cb());
  }

  /**
   * Honest read: `undefined` when nothing is loaded yet.
   *
   * This is also what the hooks hand to `useSyncExternalStore` as `getSnapshot`,
   * because React calls that outside the render phase (while deciding whether a
   * store change warrants a re-render) where a throw would escape into the
   * notifying code path. Narrowing to `T` happens in the hook, after the gate.
   */
  peek = <T,>(cacheKey: string): T | undefined => {
    return this.cache.get(cacheKey) as T | undefined;
  };

  /**
   * Post-gate read. Reaching this means `load()` already resolved and wrote the
   * cache, so an absent value is an invariant violation rather than a loading
   * state — throwing surfaces it in the widget's ErrorBoundary instead of
   * handing `undefined` to code the types promised would never see it.
   */
  read = <T,>(cacheKey: string): T => {
    if (!this.cache.has(cacheKey)) throw new PersistenceInvariantError(cacheKey);
    return this.cache.get(cacheKey) as T;
  };

  has(cacheKey: string): boolean {
    return this.cache.has(cacheKey);
  }

  write<T>(cacheKey: string, value: T) {
    this.cache.set(cacheKey, value);
    this.notify(cacheKey);
  }

  /**
   * Drops a key's cached value, its resolved gate and any recorded error, then
   * notifies. A still-mounted hook re-renders, finds no cache entry, and
   * re-Suspends on a fresh `load()` — so a deleted key returns to genuine
   * first-use state (fallback producer runs again) rather than leaving `read()`
   * throwing on what was a legitimate operation.
   */
  invalidate(cacheKey: string) {
    this.cache.delete(cacheKey);
    this.suspenseEntries.delete(cacheKey);
    this.errors.delete(cacheKey);
    this.notify(cacheKey);
  }

  subscribe(cacheKey: string, onChange: Listener): () => void {
    let set = this.listeners.get(cacheKey);
    if (!set) {
      set = new Set();
      this.listeners.set(cacheKey, set);
    }
    set.add(onChange);
    return () => {
      set.delete(onChange);
    };
  }

  /* Error bookkeeping — a failed write reverts the cache and is *also* rethrown
   * on the next render, so nothing is swallowed into a console log alone. */

  recordError(cacheKey: string, err: unknown) {
    this.errors.set(cacheKey, err);
    this.notify(cacheKey);
  }

  clearError(cacheKey: string) {
    this.errors.delete(cacheKey);
  }

  peekError(cacheKey: string): unknown {
    return this.errors.get(cacheKey);
  }

  /** ErrorBoundary `onReset`: forget failed loads so a retry can start clean. */
  retryAfterReset = (): void => {
    for (const [key, entry] of this.suspenseEntries) {
      if (entry.failed) this.suspenseEntries.delete(key);
    }
    this.errors.clear();
  };

  /**
   * Runs `load()` at most once per key while it is in flight, writing the result
   * into the cache. Shared by the render path (`gate`) and imperative callers
   * (`handle.load`), so an imperative load and a suspending render coalesce onto
   * one request instead of racing, and either one populating the cache spares the
   * other the round trip.
   */
  loadOnce<T>(cacheKey: string, load: () => Promise<T>): Promise<T> {
    const existing = this.suspenseEntries.get(cacheKey);
    if (existing) {
      log.trace(`loadOnce: reusing in-flight entry for "${cacheKey}"`, `failed=${existing.failed}`);
      return existing.promise as Promise<T>;
    }

    log.debug(`loadOnce: no existing entry, starting load()`, cacheKey);
    const entry: SuspenseEntry = {
      promise: undefined as unknown as Promise<unknown>,
      failed: false,
    };
    entry.promise = load()
      .then((value) => {
        log.debug(`loadOnce: load() resolved`, cacheKey);
        // Only commit if this is still the live entry. An `invalidate()` (e.g. a
        // delete) that landed while this load was in flight dropped it, and
        // writing anyway would resurrect the key the caller just removed.
        if (this.suspenseEntries.get(cacheKey) === entry) {
          this.write(cacheKey, value);
          this.suspenseEntries.delete(cacheKey);
        }
        return value;
      })
      .catch((err) => {
        entry.failed = true;
        log.debug(`loadOnce: load() rejected, entry stays failed until a reset`, cacheKey);
        console.error(`persistence: failed to load "${cacheKey}"`, err);
        throw err;
      });
    this.suspenseEntries.set(cacheKey, entry);
    return entry.promise as Promise<T>;
  }

  /**
   * Suspends until the key's value is loaded, then returns it. Called during
   * render (it uses React's `use()`), which is what lets a widget's own body run
   * only once its persisted data is genuinely present.
   *
   * `load` must already be deduplicated — every handle's `load()` goes through
   * `loadOnce`, which is what makes two widgets sharing a group key coalesce onto
   * one request. Do **not** wrap it in `loadOnce` again here: `loadOnce` invokes
   * its producer *before* registering its own entry, so a nested call would
   * register an inner entry that the outer one then overwrites, leaving two
   * entries per key where only the outer one's `.then` commits to the cache.
   * That happens to work, but it makes the "the map holds the entry that writes
   * the cache" invariant accidental — and it breaks outright the moment anyone
   * moves the `suspenseEntries.set` above the `load()` call, since the inner call
   * would then read back a half-built entry whose `promise` is still undefined.
   */
  gate<T>(cacheKey: string, load: () => Promise<T>): T {
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) as T;
    return use(load()) as T;
  }

  /**
   * Writes through optimistically. On failure after retries, reverts the cache to
   * backend truth *and* records the error so the next render rethrows it.
   */
  async writeOptimistic<T>(
    cacheKey: string,
    optimisticValue: T,
    persist: () => Promise<void>,
    refetch: () => Promise<T | null>,
  ) {
    this.write(cacheKey, optimisticValue);
    try {
      await withRetry(persist);
      this.clearError(cacheKey); // succeeded — forget any earlier stale failure
    } catch (err) {
      console.error(`persistence: write to ${cacheKey} failed, reverting`, err);
      try {
        const truth = await withRetry(refetch);
        if (truth !== null) this.write(cacheKey, truth);
      } catch (refetchErr) {
        console.error(`persistence: revert-refetch for ${cacheKey} also failed`, refetchErr);
      } finally {
        this.recordError(cacheKey, err);
      }
    }
  }
}
