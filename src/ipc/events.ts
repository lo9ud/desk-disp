import type {
  Config,
  CpuStats,
  MemoryStats,
  DiskInfo,
  NetworkInterfaceInfo,
  MediaState,
  FrequencyReading,
  LayoutFile,
  Preferences,
  WidgetConfig,
  StreamName,
} from "../ffi_types";

export type { StreamName } from "../ffi_types";

export type BackendEvents = {
  "stream::cpu": CpuStats;
  "stream::memory": MemoryStats;
  "stream::disks": DiskInfo[];
  "stream::networks": NetworkInterfaceInfo[];
  "stream::media": MediaState;
  "stream::visualizer": FrequencyReading[];
  "config::changed": Config;
  "theme::changed": { id: string; css: string };
  "layout::changed": { id: string; layout: LayoutFile };
  "widget::updated": { id: string; config: WidgetConfig };
  "preferences::changed": Preferences;
  "preferences::preview": Preferences;
};

export const EVENT_NAMES = [
  "stream::cpu",
  "stream::memory",
  "stream::disks",
  "stream::networks",
  "stream::media",
  "stream::visualizer",
  "config::changed",
  "theme::changed",
  "layout::changed",
  "widget::updated",
  "preferences::changed",
  "preferences::preview",
] as const satisfies readonly (keyof BackendEvents)[];

export type StreamEvents = { [K in StreamName]: BackendEvents[`stream::${K}`] };
