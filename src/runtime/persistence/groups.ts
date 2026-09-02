import type { ScratchNote } from "../../widgets/applets/ScratchpadWidget";
import type { TodoList } from "../../widgets/applets/TodoListWidget";
import type { KeyValueType } from "./handles";

/**
 * Type registry for shared (group-scoped) persistence.
 *
 * Shape per alias:
 *   { keys?: { [key]: KeyValueType }, objects?: { [key]: object }, collections?: { [name]: object } }
 */
export interface GroupRegistry {
  scratch: {
    collections: {
      notes: ScratchNote;
    };
  };
  todo: {
    collections: {
      todo_lists: TodoList;
    };
  };
}

export type GroupAlias = keyof GroupRegistry;

export type GroupKeyName<G extends GroupAlias> =
  GroupRegistry[G] extends { keys: infer U } ? keyof U : never; // Set to string in future to allow plugin-defined keys

export type GroupKeyType<G extends GroupAlias, K> =
  GroupRegistry[G] extends { keys: infer U }
    ? K extends keyof U
      ? U[K] extends KeyValueType
        ? U[K]
        : never // Set to KeyValueType in future to allow plugin-defined keys
      : never
    : never;

export type GroupObjectName<G extends GroupAlias> =
  GroupRegistry[G] extends { objects: infer U } ? keyof U : never; // Set to string in future to allow plugin-defined objects

export type GroupObjectType<G extends GroupAlias, K> =
  GroupRegistry[G] extends { objects: infer U }
    ? K extends keyof U
      ? U[K] extends object
        ? U[K]
        : never // Set to object in future to allow plugin-defined objects
      : never
    : never;

export type GroupCollectionName<G extends GroupAlias> =
  GroupRegistry[G] extends { collections: infer U } ? keyof U : never; // Set to string in future to allow plugin-defined collections

export type GroupCollectionType<G extends GroupAlias, C> =
  GroupRegistry[G] extends { collections: infer U }
    ? C extends keyof U
      ? U[C] extends object
        ? U[C]
        : never // Set to object in future to allow plugin-defined collections
      : never
    : never;
