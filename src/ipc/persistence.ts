import { useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { Scope } from "../ffi_types";
import { ipc } from "./invoke";
import { WidgetInstanceIdContext } from "../widgets/widget";
import { TodoList } from "../widgets/applets/todolist/TodoListWidget";
// import { logger } from "../utils/logger";
import {
  readCache,
  subscribeTo,
  writeCache,
  writeOptimistic,
} from "./persistence_store";

type KeyValueType = number | string | boolean;
type KeyValueKind = "number" | "string" | "boolean";
type KeyValueTypeMap = {
  number: number;
  string: string;
  boolean: boolean;
};

class KeyValueHandle<T extends KeyValueType> {
  constructor(
    private readonly _key: string,
    private readonly _scope: Scope,
    private readonly _kind: KeyValueKind,
  ) {}

  get cacheKey(): string {
    return `kv:${JSON.stringify(this._scope)}:${this._key}`;
  }

  async fetch(): Promise<T | null> {
    const value = await ipc.getKeyValue(this._key, this._scope);
    if (value === null) return null;
    switch (this._kind) {
      case "number": {
        const parsed = Number(value);
        if (Number.isNaN(parsed))
          throw new Error(`bad number for "${this._key}": "${value}"`);
        return parsed as T;
      }
      case "boolean":
        if (value === "true") return true as T;
        if (value === "false") return false as T;
        throw new Error(`bad boolean for "${this._key}": "${value}"`);
      case "string":
        return value as T;
    }
  }

  persist(value: T): Promise<void> {
    return ipc.setKeyValue(this._key, String(value), this._scope);
  }

  delete(): Promise<void> {
    return ipc.deleteKeyValue(this._key, this._scope);
  }
}

class ObjectHandle<T extends object> {
  constructor(
    private readonly _key: string,
    private readonly _scope: Scope,
    private readonly _collection?: string,
  ) {}

  get cacheKey(): string {
    return `obj:${JSON.stringify(this._scope)}:${this._collection ?? ""}:${this._key}`;
  }

  fetch(): Promise<T | null> {
    return ipc.getObject<T>(this._key, this._scope, this._collection);
  }

  persist(value: T): Promise<void> {
    return ipc.setObject<T>(this._key, value, this._scope, this._collection);
  }

  delete(): Promise<void> {
    return ipc.deleteObject(this._key, this._scope, this._collection);
  }
}

class CollectionHandle<T extends object> {
  constructor(
    private readonly _scope: Scope,
    private readonly _collection: string,
  ) {}

  get cacheKey(): string {
    return `list:${JSON.stringify(this._scope)}:${this._collection}`;
  }

  fetch(): Promise<string[]> {
    return ipc.listObjects(this._scope, this._collection);
  }

  // Synchronous - no I/O, no existence check. "Does this exist" is answered
  // by reading through the resulting handle, not by asking here.
  entry(key: string): ObjectHandle<T> {
    return new ObjectHandle<T>(key, this._scope, this._collection);
  }

  delete(key: string): Promise<void> {
    return ipc.deleteObject(key, this._scope, this._collection);
  }
}

class LiveKeyValue<T extends KeyValueType> {
  constructor(
    public readonly value: T | null | undefined,
    private readonly _set: (v: T) => void,
  ) {}
  set(v: T) {
    this._set(v);
  }
}
export type { LiveKeyValue, LiveObject, LiveCollection };

class LiveObject<T extends object> {
  constructor(
    public readonly value: T | null | undefined,
    private readonly _commit: (v: T) => void,
    private readonly _update: (recipe: (draft: T) => T) => void,
  ) {}
  commit(v: T) {
    this._commit(v);
  }
  update(recipe: (draft: T) => T) {
    this._update(recipe);
  }
}

class LiveCollection<T extends object> {
  constructor(
    private readonly _entries: Record<string, LiveObject<T>>,
    private readonly _add: (id: string, initial: T) => void,
    private readonly _delete: (id: string) => void,
  ) {}

  get items(): LiveObject<T>[] {
    return Object.values(this._entries);
  }
  get ids(): string[] {
    return Object.keys(this._entries);
  }
  get entries(): typeof this._entries {
    return this._entries;
  }

  add(id: string, initial: T) {
    this._add(id, initial);
  }
  get(id: string): LiveObject<T> | undefined {
    return this._entries[id];
  }
  update(id: string, recipe: (draft: T) => T) {
    this._entries[id]?.update(recipe);
  }
  delete(id: string) {
    this._delete(id);
  }
}

function useLiveKeyValue<T extends KeyValueType>(
  handle: KeyValueHandle<T>,
): LiveKeyValue<T> {
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeTo(handle.cacheKey, () => handle.fetch())(onChange),
    [handle],
  );
  const value = useSyncExternalStore(subscribe, () =>
    readCache<T>(handle.cacheKey),
  );
  const set = useCallback(
    (next: T) =>
      writeOptimistic(
        handle.cacheKey,
        next,
        () => handle.persist(next),
        () => handle.fetch(),
      ),
    [handle],
  );
  return useMemo(() => new LiveKeyValue(value, set), [value, set]);
}

function useLiveObject<T extends object>(
  handle: ObjectHandle<T>,
): LiveObject<T> {
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeTo(handle.cacheKey, () => handle.fetch())(onChange),
    [handle],
  );
  const value = useSyncExternalStore(subscribe, () =>
    readCache<T>(handle.cacheKey),
  );
  const commit = useCallback(
    (next: T) =>
      writeOptimistic(
        handle.cacheKey,
        next,
        () => handle.persist(next),
        () => handle.fetch(),
      ),
    [handle],
  );
  const update = useCallback(
    (recipe: (draft: T) => T) =>
      commit(recipe(readCache<T>(handle.cacheKey) as T)),
    [handle, commit],
  );
  return useMemo(
    () => new LiveObject(value, commit, update),
    [value, commit, update],
  );
}

function useLiveCollection<T extends object>(
  handle: CollectionHandle<T>,
): LiveCollection<T> {
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeTo(handle.cacheKey, async () => {
        const ids = await handle.fetch();
        const pairs = await Promise.all(
          ids.map(async (id) => [id, await handle.entry(id).fetch()] as const),
        );
        return Object.fromEntries(pairs);
      })(onChange),
    [handle],
  );
  const raw =
    useSyncExternalStore(subscribe, () =>
      readCache<Record<string, T>>(handle.cacheKey),
    ) ?? {};

  const update = useCallback(
    (id: string, recipe: (draft: T) => T) => {
      const current = readCache<Record<string, T>>(handle.cacheKey) ?? {};
      const next = { ...current, [id]: recipe(current[id]) };
      writeOptimistic(
        handle.cacheKey,
        next,
        () => handle.entry(id).persist(next[id]),
        async () => ({
          ...readCache<Record<string, T>>(handle.cacheKey),
          [id]: await handle.entry(id).fetch(),
        }),
      );
    },
    [handle],
  );

  const add = useCallback(
    (id: string, initial: T) => update(id, () => initial),
    [update],
  );

  const del = useCallback(
    (id: string) => {
      const { [id]: _, ...rest } =
        readCache<Record<string, T>>(handle.cacheKey) ?? {};
      writeCache(handle.cacheKey, rest);
      handle.delete(id).catch(console.error);
    },
    [handle],
  );

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
    [entries, add, update, del],
  );
}

// Instance-scoped key-value and object store handles

export function useInstanceKeyValue<
  K extends KeyValueKind,
  T extends KeyValueTypeMap[K],
>(key: string, kind: K): LiveKeyValue<T> {
  const widgetId = useContext(WidgetInstanceIdContext);
  if (!widgetId)
    throw new Error(
      "useInstanceKeyValue must be used within a WidgetInstanceIdContext provider",
    );
  const handle = useMemo(
    () => new KeyValueHandle<T>(key, { Widget: widgetId }, kind),
    [key, widgetId, kind],
  );
  return useLiveKeyValue<T>(handle);
}

export function useInstanceObject<T extends object>(
  key: string,
  collection?: string,
): LiveObject<T> {
  const widgetId = useContext(WidgetInstanceIdContext);
  if (!widgetId)
    throw new Error(
      "useInstanceObject must be used within a WidgetInstanceIdContext provider",
    );
  const handle = useMemo(
    () => new ObjectHandle<T>(key, { Widget: widgetId }, collection),
    [key, widgetId, collection],
  );
  return useLiveObject(handle);
}

export function useInstanceCollection<T extends object>(
  collection: string,
): LiveCollection<T> {
  const widgetId = useContext(WidgetInstanceIdContext);
  if (!widgetId)
    throw new Error(
      "useInstanceCollection must be used within a WidgetInstanceIdContext provider",
    );
  const handle = useMemo(
    () => new CollectionHandle<T>({ Widget: widgetId }, collection),
    [widgetId, collection],
  );
  return useLiveCollection(handle);
}

// Called once per row/entry in a list, in its own child component - see
// "Collections and the rules of hooks" below for why this has to be a
// separate hook rather than something called from inside .map().
export function useInstanceCollectionEntry<T extends object>(
  collection: string,
  key: string,
): LiveObject<T> {
  const widgetId = useContext(WidgetInstanceIdContext);
  if (!widgetId)
    throw new Error(
      "useInstanceCollectionEntry must be used within a WidgetInstanceIdContext provider",
    );
  const handle = useMemo(
    () => new ObjectHandle<T>(key, { Widget: widgetId }, collection),
    [widgetId, collection, key],
  );
  return useLiveObject(handle);
}

// Group-scoped key-value and object store handles

// Group type registry

// interface GroupRegistryMeta {
//   [group_alias: string]: {
//     keys: {
//       [key: string]: KeyValueType;
//     };
//     objects: {
//       [key: string]: object;
//     };
//     collections: {
//       [collection: string]: object;
//     };
//   };
// }

interface GroupRegistry {
  todo: {
    collections: {
      todo_lists: TodoList;
    };
  };
}

export function useGroupKeyValue<
  G extends keyof GroupRegistry,
  K extends GroupRegistry[G] extends { keys: infer U } ? keyof U : never,
  T extends GroupRegistry[G] extends { keys: infer U }
    ? U[K] extends KeyValueType
      ? U[K]
      : never
    : never,
>(scope_alias: G, key: K, kind: KeyValueKind): LiveKeyValue<T> {
  const handle = useMemo(
    () =>
      new KeyValueHandle<T>(
        key as string,
        { Group: scope_alias as string },
        kind,
      ),
    [key, scope_alias, kind],
  );
  return useLiveKeyValue(handle);
}

export function useGroupObject<
  G extends keyof GroupRegistry,
  K extends GroupRegistry[G] extends { objects: infer U } ? keyof U : never,
  T extends GroupRegistry[G] extends { objects: infer U }
    ? U[K] extends object
      ? U[K]
      : never
    : never,
>(scope_alias: G, key: K): LiveObject<T> {
  const handle = useMemo(
    () => new ObjectHandle<T>(key as string, { Group: scope_alias as string }),
    [key, scope_alias],
  );
  return useLiveObject(handle);
}

export function useGroupCollection<
  G extends keyof GroupRegistry,
  C extends GroupRegistry[G] extends { collections: infer U } ? keyof U : never,
  T extends GroupRegistry[G] extends { collections: infer U }
    ? U[C] extends object
      ? U[C]
      : never
    : never,
>(scope_alias: G, collection: C): LiveCollection<T> {
  const handle = useMemo(
    () =>
      new CollectionHandle<T>(
        { Group: scope_alias as string },
        collection as string,
      ),
    [scope_alias, collection],
  );
  return useLiveCollection(handle);
}
