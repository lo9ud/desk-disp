import type {
  Config,
  SystemStats,
  MediaState,
  FrequencyReading,
  HardwareStats,
  LayoutFile,
  Preferences,
  WidgetConfig,
} from "../ffi_types";

export type ChannelName = "system" | "media" | "visualizer" | "hardware";

export type BackendEvents = {
  "stream::system": SystemStats;
  "stream::media": MediaState;
  "stream::visualizer": FrequencyReading[];
  "stream::hardware": HardwareStats;
  "config::changed": Config;
  "theme::changed": { id: string; css: string };
  "layout::changed": { id: string; layout: LayoutFile };
  "widget::updated": { id: string; config: WidgetConfig };
  "preferences::changed": Preferences;
  "preferences::preview": Preferences;
};

export type StreamEvents = { [K in ChannelName]: BackendEvents[`stream::${K}`] };
