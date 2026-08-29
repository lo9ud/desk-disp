import type { Scope } from "../../ffi_types";
import { logger } from "../../utils/logger";
import type { PersistenceBackend } from "./backend";
import { PersistenceStore, withRetry } from "./PersistenceStore";

const log = logger("persistence");

export type KeyValueType = number | string | boolean;
export type KeyValueKind = "number" | "string" | "boolean";
export type KeyValueTypeMap = {
  number: number;
  string: string;
  boolean: boolean;
};

/**
 * First-usage producer, not a loading placeholder. Invoked at most once ever per
 * key, only when the backend genuinely has no value yet; its result is both used
 * immediately and persisted as that key's first value. May have side effects, and
 * may read the results of hooks called earlier in the same render.
 */
export type FallbackProducer<T> = () => T | Promise<T>;

/**
 * Shared plumbing for the three handle kinds. A handle is a long-lived object
 * bound to one store, one backend and one scope — the scope is captured at
 * construction, so nothing downstream takes a scope (or a widget id) as an
 * argument it could get wrong.
 */
abstract class Handle<T> {
  protected constructor(
    protected readonly store: PersistenceStore,
    protected readonly backend: PersistenceBackend,
    readonly cacheKey: string,
  ) {}

  /** Honest sync read; `undefined` until loaded. Safe to call at any time. */
  peek = (): T | undefined => this.store.peek<T>(this.cacheKey);

  /**
   * Sync read for callers past the load. Throws rather than returning
   * `undefined`, so the "always loaded" contract is enforced instead of asserted.
   */
  read = (): T => this.store.read<T>(this.cacheKey);

  subscribe = (onChange: () => void): (() => void) =>
    this.store.subscribe(this.cacheKey, onChange);

  /**
   * A write that failed after retries, if any. The cache has already been
   * reverted to backend truth by then; surfacing it is what stops a failure being
   * swallowed into a console log alone.
   */
  error = (): unknown => this.store.peekError(this.cacheKey);

  /**
   * Suspends this render until the value is loaded. Render-phase only — it goes
   * through React's `use()`.
   *
   * Pass this handle's own `load(...)`, which is already deduplicated via
   * `store.loadOnce`; the gate does not wrap it again. See `PersistenceStore.gate`.
   *
   * Deliberately routed via the handle rather than by handing callers the store:
   * the store is shared across every scope, so exposing it to a widget would be a
   * lateral read of every other widget's data.
   */
  gate(load: () => Promise<T>): T {
    return this.store.gate<T>(this.cacheKey, load);
  }
}

/**
 * The read side of a handle — what the hooks need, without the mutators.
 *
 * `gate`'s `load` must be a deduplicated producer (i.e. this handle's `load()`),
 * not a raw fetch.
 */
export interface ReadableHandle<T> {
  readonly cacheKey: string;
  peek(): T | undefined;
  subscribe(onChange: () => void): () => void;
  error(): unknown;
  gate(load: () => Promise<T>): T;
}

function loadWithFallback<T>(
  fetch: () => Promise<T | null>,
  persist: (v: T) => Promise<void>,
  fallback: FallbackProducer<T>,
): () => Promise<T> {
  return async () => {
    log.debug("loadWithFallback: calling fetch()");
    const v = await withRetry(fetch);
    if (v !== null) {
      log.debug("loadWithFallback: fetch() returned a value, done");
      return v;
    }
    log.debug("loadWithFallback: fetch() returned null, invoking fallback producer");
    // Deliberately outside withRetry: a fallback producer may have side effects
    // and must run at most once.
    const fb = await fallback();
    log.debug("loadWithFallback: calling persist() with fallback value");
    await withRetry(() => persist(fb));
    log.debug("loadWithFallback: persist() succeeded, done");
    return fb;
  };
}

export class KeyValueHandle<T extends KeyValueType> extends Handle<T> {
  constructor(
    store: PersistenceStore,
    backend: PersistenceBackend,
    private readonly key: string,
    private readonly scope: Scope,
    private readonly kind: KeyValueKind,
  ) {
    super(store, backend, `kv:${JSON.stringify(scope)}:${key}`);
  }

  async fetch(): Promise<T | null> {
    const value = await this.backend.getKv(this.key, this.scope);
    if (value === null) return null;
    switch (this.kind) {
      case "number": {
        const parsed = Number(value);
        if (Number.isNaN(parsed))
          throw new Error(`bad number for "${this.key}": "${value}"`);
        return parsed as T;
      }
      case "boolean":
        if (value === "true") return true as T;
        if (value === "false") return false as T;
        throw new Error(`bad boolean for "${this.key}": "${value}"`);
      case "string":
        return value as T;
    }
  }

  persist(value: T): Promise<void> {
    return this.backend.setKv(this.key, String(value), this.scope);
  }

  /** Fetch-or-first-use, deduplicated per key by the store. */
  load(fallback: FallbackProducer<T>): Promise<T> {
    return this.store.loadOnce(
      this.cacheKey,
      loadWithFallback<T>(
        () => this.fetch(),
        (v) => this.persist(v),
        fallback,
      ),
    );
  }

  set(next: T): void {
    this.store.writeOptimistic(
      this.cacheKey,
      next,
      () => this.persist(next),
      () => this.fetch(),
    );
  }

  /** Removes the key and returns it to first-use state. See `store.invalidate`. */
  async delete(): Promise<void> {
    await withRetry(() => this.backend.deleteKv(this.key, this.scope));
    this.store.invalidate(this.cacheKey);
  }
}

export class ObjectHandle<T extends object> extends Handle<T> {
  constructor(
    store: PersistenceStore,
    backend: PersistenceBackend,
    private readonly key: string,
    private readonly scope: Scope,
    private readonly collection?: string,
  ) {
    super(
      store,
      backend,
      `obj:${JSON.stringify(scope)}:${collection ?? ""}:${key}`,
    );
  }

  fetch(): Promise<T | null> {
    return this.backend.getObject<T>(this.key, this.scope, this.collection);
  }

  persist(value: T): Promise<void> {
    return this.backend.setObject<T>(
      this.key,
      value,
      this.scope,
      this.collection,
    );
  }

  load(fallback: FallbackProducer<T>): Promise<T> {
    return this.store.loadOnce(
      this.cacheKey,
      loadWithFallback<T>(
        () => this.fetch(),
        (v) => this.persist(v),
        fallback,
      ),
    );
  }

  commit(next: T): void {
    this.store.writeOptimistic(
      this.cacheKey,
      next,
      () => this.persist(next),
      () => this.fetch(),
    );
  }

  update(recipe: (draft: T) => T): void {
    this.commit(recipe(this.read()));
  }

  async delete(): Promise<void> {
    await withRetry(() =>
      this.backend.deleteObject(this.key, this.scope, this.collection),
    );
    this.store.invalidate(this.cacheKey);
  }
}

/**
 * A whole collection, cached as one `Record<string, T>` under a single key.
 * Entries load eagerly on first read — fine for per-widget datasets, and it is
 * what lets `.items`/`.ids` be plain synchronous properties.
 */
export class CollectionHandle<T extends object> extends Handle<
  Record<string, T>
> {
  constructor(
    store: PersistenceStore,
    backend: PersistenceBackend,
    private readonly scope: Scope,
    private readonly collection: string,
  ) {
    super(store, backend, `list:${JSON.stringify(scope)}:${collection}`);
  }

  /** Handle for one entry, usable without loading the rest of the collection. */
  entry(key: string): ObjectHandle<T> {
    return new ObjectHandle<T>(
      this.store,
      this.backend,
      key,
      this.scope,
      this.collection,
    );
  }

  /**
   * No fallback parameter: once Suspense guarantees the load finished, an empty
   * collection is already an unambiguous, valid first-use state.
   */
  load(): Promise<Record<string, T>> {
    return this.store.loadOnce(this.cacheKey, async () => {
      const ids = await withRetry(() =>
        this.backend.listObjects(this.scope, this.collection),
      );
      const pairs = await Promise.all(
        ids.map(
          async (id) =>
            [id, await withRetry(() => this.entry(id).fetch())] as const,
        ),
      );
      return Object.fromEntries(pairs) as Record<string, T>;
    });
  }

  ids(): string[] {
    return Object.keys(this.peek() ?? {});
  }

  update(id: string, recipe: (draft: T) => T): void {
    const current = this.peek() ?? {};
    const next = { ...current, [id]: recipe(current[id]) };
    this.store.writeOptimistic(
      this.cacheKey,
      next,
      () => this.entry(id).persist(next[id]),
      async () => ({
        ...this.peek(),
        [id]: await this.entry(id).fetch(),
      }),
    );
  }

  add(id: string, initial: T): void {
    this.update(id, () => initial);
  }

  /**
   * Removes one entry. Unlike the single-key handles this does not invalidate the
   * collection — the collection itself still exists and is still loaded, it just
   * has one fewer member.
   */
  delete(id: string): void {
    const current = this.read();
    const { [id]: _removed, ...rest } = current;
    this.store.write(this.cacheKey, rest);
    withRetry(() => this.backend.deleteObject(id, this.scope, this.collection))
      .then(() => this.store.clearError(this.cacheKey))
      .catch((err) => {
        console.error(
          `persistence: delete ${id} from ${this.cacheKey} failed, reverting`,
          err,
        );
        this.store.write(this.cacheKey, current);
        this.store.recordError(this.cacheKey, err);
      });
  }
}
