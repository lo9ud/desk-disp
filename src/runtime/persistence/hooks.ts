import { useCallback, useMemo, useSyncExternalStore } from "react";
import { logger } from "../../utils/logger";
import { useWidgetApi } from "../context";
import type {
  GroupAlias,
  GroupCollectionName,
  GroupCollectionType,
  GroupKeyName,
  GroupKeyType,
  GroupObjectName,
  GroupObjectType,
} from "./groups";
import type {
  CollectionHandle,
  FallbackProducer,
  KeyValueHandle,
  KeyValueKind,
  KeyValueTypeMap,
  ObjectHandle,
  ReadableHandle,
} from "./handles";
import { LiveCollection, LiveKeyValue, LiveObject } from "./live";
import { PersistenceInvariantError } from "./PersistenceStore";

const log = logger("persistence");

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Reads a handle's current value reactively, having already passed its Suspense
 * gate.
 *
 * `peek` is what goes to `useSyncExternalStore` because React also calls
 * `getSnapshot` outside the render phase — while deciding whether a store change
 * warrants a re-render — where a throw would escape into the notifying code path.
 * The narrowing then happens here, in render, as a control-flow guard rather than
 * an `as T` cast: `value` is `T` below this line because the branch above proved
 * it, so the contract is enforced instead of asserted.
 *
 * The `undefined` branch is unreachable in practice. Anything that clears a
 * cached value also clears its gate entry (`store.invalidate`), so the next
 * render re-Suspends at the `handle.gate(load)` line above and never reaches the
 * read. Arriving here means the persistence layer broke its own invariant, which
 * belongs in the widget's ErrorBoundary, not in widget code as a null check.
 */
function useGatedValue<T>(
  handle: ReadableHandle<T>,
  load: () => Promise<T>,
): T {
  handle.gate(load);

  const value = useSyncExternalStore(handle.subscribe, handle.peek);

  const err = handle.error();
  if (err) {
    log.debug(
      `useGatedValue: throwing pending recorded error for "${handle.cacheKey}"`,
      describeError(err),
    );
    throw err;
  }

  if (value === undefined) throw new PersistenceInvariantError(handle.cacheKey);
  return value;
}

function useLiveKeyValue<T extends number | string | boolean>(
  handle: KeyValueHandle<T>,
  fallback: FallbackProducer<T>,
): LiveKeyValue<T> {
  const value = useGatedValue<T>(handle, () => handle.load(fallback));
  const set = useCallback((next: T) => handle.set(next), [handle]);
  return useMemo(() => new LiveKeyValue(value, set), [value, set]);
}

function useLiveObject<T extends object>(
  handle: ObjectHandle<T>,
  fallback: FallbackProducer<T>,
): LiveObject<T> {
  const value = useGatedValue<T>(handle, () => handle.load(fallback));
  const commit = useCallback((next: T) => handle.commit(next), [handle]);
  const update = useCallback(
    (recipe: (draft: T) => T) => handle.update(recipe),
    [handle],
  );
  return useMemo(
    () => new LiveObject(value, commit, update),
    [value, commit, update],
  );
}

function useLiveCollection<T extends object>(
  handle: CollectionHandle<T>,
): LiveCollection<T> {
  const raw = useGatedValue<Record<string, T>>(handle, () => handle.load());

  const update = useCallback(
    (id: string, recipe: (draft: T) => T) => handle.update(id, recipe),
    [handle],
  );
  const add = useCallback(
    (id: string, initial: T) => handle.add(id, initial),
    [handle],
  );
  const del = useCallback((id: string) => handle.delete(id), [handle]);

  const entries = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(raw).map(([id, value]) => [
          id,
          new LiveObject<T>(
            value,
            (v) => update(id, () => v),
            (recipe) => update(id, recipe),
          ),
        ]),
      ),
    [raw, update],
  );

  return useMemo(
    () => new LiveCollection(entries, add, del),
    [entries, add, del],
  );
}

/* Instance-scoped */

export function useInstanceKeyValue<
  K extends KeyValueKind,
  T extends KeyValueTypeMap[K],
>(key: string, kind: K, fallback: FallbackProducer<T>): LiveKeyValue<T> {
  const api = useWidgetApi();
  const handle = useMemo(() => api.kv<T>(key, kind), [api, key, kind]);
  return useLiveKeyValue(handle, fallback);
}

export function useInstanceObject<T extends object>(
  key: string,
  fallback: FallbackProducer<T>,
  collection?: string,
): LiveObject<T> {
  const api = useWidgetApi();
  const handle = useMemo(
    () => api.object<T>(key, collection),
    [api, key, collection],
  );
  return useLiveObject(handle, fallback);
}

export function useInstanceCollection<T extends object>(
  collection: string,
): LiveCollection<T> {
  const api = useWidgetApi();
  const handle = useMemo(
    () => api.collection<T>(collection),
    [api, collection],
  );
  return useLiveCollection(handle);
}

/** One entry of a collection, without loading the rest of it. */
export function useInstanceCollectionEntry<T extends object>(
  collection: string,
  key: string,
  fallback: FallbackProducer<T>,
): LiveObject<T> {
  return useInstanceObject<T>(key, fallback, collection);
}

/* Group-scoped */

export function useGroupKeyValue<G extends GroupAlias, K extends GroupKeyName<G>>(
  alias: G,
  key: K,
  kind: KeyValueKind,
  fallback: FallbackProducer<GroupKeyType<G, K>>,
): LiveKeyValue<GroupKeyType<G, K>> {
  const api = useWidgetApi();
  const handle = useMemo(
    () => api.groupKv(alias, key, kind),
    [api, alias, key, kind],
  );
  return useLiveKeyValue(handle, fallback);
}

export function useGroupObject<G extends GroupAlias, K extends GroupObjectName<G>>(
  alias: G,
  key: K,
  fallback: FallbackProducer<GroupObjectType<G, K>>,
): LiveObject<GroupObjectType<G, K>> {
  const api = useWidgetApi();
  const handle = useMemo(() => api.groupObject(alias, key), [api, alias, key]);
  return useLiveObject(handle, fallback);
}

export function useGroupCollection<
  G extends GroupAlias,
  C extends GroupCollectionName<G>,
>(alias: G, collection: C): LiveCollection<GroupCollectionType<G, C>> {
  const api = useWidgetApi();
  const handle = useMemo(
    () => api.groupCollection(alias, collection),
    [api, alias, collection],
  );
  return useLiveCollection(handle);
}

export { LiveCollection, LiveKeyValue, LiveObject };
