import type { Logger } from "../utils/logger";
import { logger } from "../utils/logger";
import type { Clock } from "./clock";
import type { MediaCommands } from "./commands/media";
import type { PersistenceBackend } from "./persistence/backend";
import type { PersistenceStore } from "./persistence/PersistenceStore";
import {
  CollectionHandle,
  KeyValueHandle,
  ObjectHandle,
  type KeyValueKind,
  type KeyValueType,
} from "./persistence/handles";
import type {
  GroupAlias,
  GroupCollectionName,
  GroupCollectionType,
  GroupKeyName,
  GroupKeyType,
  GroupObjectName,
  GroupObjectType,
} from "./persistence/groups";
import type { StreamSource } from "./streams/types";

/**
 * Everything a widget is given to work with, scoped to one instance.
 */
export interface WidgetApi {
  readonly instanceId: string;
  readonly definitionId: string;
  /** True inside a gallery card or test harness. A declared affordance, not a hint to branch on lightly. */
  readonly isPreview: boolean;

  readonly streams: StreamSource;
  readonly media: MediaCommands;
  readonly log: Logger;

  /** Injected time source; deterministic under a preview or test clock. */
  now(): number;

  /* Instance-scoped persistence */
  kv<T extends KeyValueType>(key: string, kind: KeyValueKind): KeyValueHandle<T>;
  object<T extends object>(key: string, collection?: string): ObjectHandle<T>;
  collection<T extends object>(collection: string): CollectionHandle<T>;

  /* Group-scoped persistence - typed against GroupRegistry */
  groupKv<G extends GroupAlias, K extends GroupKeyName<G>>(
    alias: G,
    key: K,
    kind: KeyValueKind,
  ): KeyValueHandle<GroupKeyType<G, K>>;
  groupObject<G extends GroupAlias, K extends GroupObjectName<G>>(
    alias: G,
    key: K,
  ): ObjectHandle<GroupObjectType<G, K>>;
  groupCollection<G extends GroupAlias, C extends GroupCollectionName<G>>(
    alias: G,
    collection: C,
  ): CollectionHandle<GroupCollectionType<G, C>>;

  /** ErrorBoundary `onReset` - forget failed persistence loads so a retry starts clean. */
  retryPersistence(): void;
}

export interface WidgetApiDeps {
  streams: StreamSource;
  media: MediaCommands;
  store: PersistenceStore;
  backend: PersistenceBackend;
  clock: Clock;
  isPreview: boolean;
}

export function makeWidgetApi(
  instanceId: string,
  definitionId: string,
  deps: WidgetApiDeps,
): WidgetApi {
  const { streams, media, store, backend, clock, isPreview } = deps;
  const scope = { Widget: instanceId } as const;

  return {
    instanceId,
    definitionId,
    isPreview,
    streams,
    media,
    log: logger(`widget:${definitionId}:${instanceId}`),
    now: () => clock.now(),

    kv: <T extends KeyValueType>(key: string, kind: KeyValueKind) =>
      new KeyValueHandle<T>(store, backend, key, scope, kind),
    object: <T extends object>(key: string, collection?: string) =>
      new ObjectHandle<T>(store, backend, key, scope, collection),
    collection: <T extends object>(collection: string) =>
      new CollectionHandle<T>(store, backend, scope, collection),

    groupKv: <G extends GroupAlias, K extends GroupKeyName<G>>(
      alias: G,
      key: K,
      kind: KeyValueKind,
    ) =>
      new KeyValueHandle<GroupKeyType<G, K>>(
        store,
        backend,
        key as string,
        { Group: alias as string },
        kind,
      ),
    groupObject: <G extends GroupAlias, K extends GroupObjectName<G>>(
      alias: G,
      key: K,
    ) =>
      new ObjectHandle<GroupObjectType<G, K>>(store, backend, key as string, {
        Group: alias as string,
      }),
    groupCollection: <G extends GroupAlias, C extends GroupCollectionName<G>>(
      alias: G,
      collection: C,
    ) =>
      new CollectionHandle<GroupCollectionType<G, C>>(
        store,
        backend,
        { Group: alias as string },
        collection as string,
      ),

    retryPersistence: store.retryAfterReset,
  };
}
