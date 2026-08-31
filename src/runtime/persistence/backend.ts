import type { Scope } from "../../ffi_types";
import type { Transport } from "../transport";

/**
 * Raw persistence IO
 */
export interface PersistenceBackend {
  getKv(key: string, scope: Scope): Promise<string | null>;
  setKv(key: string, value: string, scope: Scope): Promise<void>;
  deleteKv(key: string, scope: Scope): Promise<void>;
  listKv(scope: Scope): Promise<string[]>;

  getObject<T extends object>(
    key: string,
    scope: Scope,
    collection?: string,
  ): Promise<T | null>;
  setObject<T extends object>(
    key: string,
    value: T,
    scope: Scope,
    collection?: string,
  ): Promise<void>;
  deleteObject(key: string, scope: Scope, collection?: string): Promise<void>;
  listObjects(scope: Scope, collection?: string): Promise<string[]>;
}

export function tauriPersistenceBackend(t: Transport): PersistenceBackend {
  return {
    getKv: (key, scope) => t.invoke<string | null>("get_kv", { key, scope }),
    setKv: (key, value, scope) => t.invoke<void>("set_kv", { key, value, scope }),
    deleteKv: (key, scope) =>
      t.invoke<void>("delete_kv", { key, scope, strict: false }),
    listKv: (scope) => t.invoke<string[]>("list_kv", { scope }),

    getObject: <T extends object>(
      key: string,
      scope: Scope,
      collection?: string,
    ) => t.invoke<T | null>("get_object", { key, scope, collection }),
    setObject: <T extends object>(
      key: string,
      value: T,
      scope: Scope,
      collection?: string,
    ) => t.invoke<void>("set_object", { key, value, scope, collection }),
    deleteObject: (key, scope, collection) =>
      t.invoke<void>("delete_object", { key, scope, collection, strict: false }),
    listObjects: (scope, collection) =>
      t.invoke<string[]>("list_objects", { scope, collection }),
  };
}
