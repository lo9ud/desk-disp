import type { TodoList } from "../../widgets/applets/todolist/TodoListWidget";
import type { KeyValueType } from "./handles";

/**
 * Type registry for shared (group-scoped) persistence. A group alias must be
 * declared here before it can be used — an undeclared one resolves to `never`,
 * so the mistake is a compile error rather than a silently empty scope.
 *
 * Shape per alias:
 *   { keys?: { [key]: KeyValueType }, objects?: { [key]: object }, collections?: { [name]: object } }
 */
export interface GroupRegistry {
  todo: {
    collections: {
      todo_lists: TodoList;
    };
  };
}

export type GroupAlias = keyof GroupRegistry;

export type GroupKeyName<G extends GroupAlias> =
  GroupRegistry[G] extends { keys: infer U } ? keyof U : never;

export type GroupKeyType<G extends GroupAlias, K> =
  GroupRegistry[G] extends { keys: infer U }
    ? K extends keyof U
      ? U[K] extends KeyValueType
        ? U[K]
        : never
      : never
    : never;

export type GroupObjectName<G extends GroupAlias> =
  GroupRegistry[G] extends { objects: infer U } ? keyof U : never;

export type GroupObjectType<G extends GroupAlias, K> =
  GroupRegistry[G] extends { objects: infer U }
    ? K extends keyof U
      ? U[K] extends object
        ? U[K]
        : never
      : never
    : never;

export type GroupCollectionName<G extends GroupAlias> =
  GroupRegistry[G] extends { collections: infer U } ? keyof U : never;

export type GroupCollectionType<G extends GroupAlias, C> =
  GroupRegistry[G] extends { collections: infer U }
    ? C extends keyof U
      ? U[C] extends object
        ? U[C]
        : never
      : never
    : never;
