import type { Scope } from "../../ffi_types";
import type { PersistenceBackend } from "./backend";

/**
 * In-memory stand-in for the backend's file store, used by preview renders and
 * tests. Applets' first-use fallback producers *write* by design, so preview
 * writes have to succeed — they just must not reach disk or leave stray scope
 * directories behind. Denying them instead would make every applet preview
 * throw.
 *
 * One instance per runtime, so two preview environments cannot see each other's
 * data.
 */
export function memoryBackend(): PersistenceBackend {
  const store = new Map<string, unknown>();

  const storeKey = (scope: Scope, collection: string | undefined, key: string) =>
    `${JSON.stringify(scope)}:${collection ?? ""}:${key}`;

  const get = <T,>(scope: Scope, collection: string | undefined, key: string) => {
    const value = store.get(storeKey(scope, collection, key));
    return (value === undefined ? null : value) as T | null;
  };

  const list = (scope: Scope, collection: string | undefined) => {
    const prefix = `${JSON.stringify(scope)}:${collection ?? ""}:`;
    return [...store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  };

  return {
    getKv: (key, scope) => Promise.resolve(get<string>(scope, undefined, key)),
    setKv: (key, value, scope) => {
      store.set(storeKey(scope, undefined, key), value);
      return Promise.resolve();
    },
    deleteKv: (key, scope) => {
      store.delete(storeKey(scope, undefined, key));
      return Promise.resolve();
    },
    listKv: (scope) => Promise.resolve(list(scope, undefined)),

    getObject: <T extends object>(
      key: string,
      scope: Scope,
      collection?: string,
    ) => Promise.resolve(get<T>(scope, collection, key)),
    setObject: <T extends object>(
      key: string,
      value: T,
      scope: Scope,
      collection?: string,
    ) => {
      store.set(storeKey(scope, collection, key), value);
      return Promise.resolve();
    },
    deleteObject: (key, scope, collection) => {
      store.delete(storeKey(scope, collection, key));
      return Promise.resolve();
    },
    listObjects: (scope, collection) => Promise.resolve(list(scope, collection)),
  };
}
