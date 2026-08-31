import type { Args } from "../ffi_types";
import { InstanceRegistry } from "../registry/instanceRegistry";
import { setLogTransport } from "../utils/logger";
import { systemClock, type Clock } from "./clock";
import { cliArgs } from "./cliArgs";
import { makeConfigCommands, type ConfigCommands } from "./commands/config";
import { makeLayoutCommands, type LayoutCommands } from "./commands/layouts";
import { makeMediaCommands, type MediaCommands } from "./commands/media";
import { makeStreamIoCommands } from "./commands/streamIo";
import { makeThemeCommands, type ThemeCommands } from "./commands/themes";
import { makeWindowCommands, type WindowCommands } from "./commands/window";
import { makeEventBus, type EventBus } from "./events";
import {
  tauriPersistenceBackend,
  type PersistenceBackend,
} from "./persistence/backend";
import { PersistenceStore } from "./persistence/PersistenceStore";
import { BackendStreamHub } from "./streams/BackendStreamHub";
import type { StreamSource } from "./streams/types";
import { tauriTransport, type Transport } from "./transport";
import { makeWidgetApi, type WidgetApi } from "./WidgetApi";

/**
 * Root of the dependency graph, constructed once per window. Owns the real
 * resources: transport, stream hub, persistence store, instance registry and
 * the factory for widget-scoped children.
 */
export interface AppRuntime {
  readonly transport: Transport;
  readonly events: EventBus;
  readonly streams: StreamSource;
  readonly persistence: PersistenceStore;
  readonly instances: InstanceRegistry;

  readonly media: MediaCommands;
  readonly config: ConfigCommands;
  readonly themes: ThemeCommands;
  readonly layouts: LayoutCommands;
  readonly window: WindowCommands;

  readonly clock: Clock;
  readonly isPreview: boolean;
  /** The process's CLI args, injected at webview creation. See `cliArgs.ts`. */
  readonly cli: Args;

  forWidget(instanceId: string, definitionId: string): WidgetApi;
  dispose(): void;
}

export interface AppRuntimeOptions {
  transport?: Transport;
  /** Override to run against generated data (preview) or recorded frames (tests). */
  streams?: (deps: { transport: Transport; events: EventBus }) => StreamSource;
  persistenceBackend?: PersistenceBackend;
  clock?: Clock;
  isPreview?: boolean;
  /** Override so a preview or test runtime states its own flags rather than
   * inheriting whatever the surrounding process was launched with. */
  cli?: Args;
}

export function createAppRuntime(opts: AppRuntimeOptions = {}): AppRuntime {
  const transport = opts.transport ?? tauriTransport();
  const clock = opts.clock ?? systemClock;
  const isPreview = opts.isPreview ?? false;

  // Frontend logs are shipped to the tracing subscriber over the same channel as
  // everything else; the logger keeps its module-level factory (see utils/logger)
  // but stops importing `invoke` itself.
  if (!isPreview) setLogTransport(transport);

  const events = makeEventBus(transport);
  const streams =
    opts.streams?.({ transport, events }) ??
    new BackendStreamHub(makeStreamIoCommands(transport), events);

  const backend = opts.persistenceBackend ?? tauriPersistenceBackend(transport);
  const persistence = new PersistenceStore(backend);
  const instances = new InstanceRegistry();
  const media = makeMediaCommands(transport);

  const widgetDeps = {
    streams,
    media,
    store: persistence,
    backend,
    clock,
    isPreview,
  };

  return {
    transport,
    events,
    streams,
    persistence,
    instances,

    media,
    config: makeConfigCommands(transport, events),
    themes: makeThemeCommands(transport),
    layouts: makeLayoutCommands(transport),
    window: makeWindowCommands(transport),

    clock,
    isPreview,
    cli: opts.cli ?? cliArgs(),

    forWidget: (instanceId, definitionId) =>
      makeWidgetApi(instanceId, definitionId, widgetDeps),

    dispose() {
      streams.dispose();
    },
  };
}
