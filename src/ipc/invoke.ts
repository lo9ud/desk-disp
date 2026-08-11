import { invoke } from "@tauri-apps/api/core";
import type {
  Config,
  LayoutFile,
  LayoutInfo,
  Preferences,
  Scope,
  ThemeData,
  ThemeInfo,
  WidgetConfig,
} from "../ffi_types";
import type { BackendEvents, StreamName } from "./events";

export interface SubscribeResult<T extends StreamName> {
  is_first_subscriber: boolean;
  last_value: BackendEvents[`stream::${T}`] | null;
}

export async function subscribeChannel<T extends StreamName>(
  channel: T,
): Promise<SubscribeResult<T>> {
  return invoke<SubscribeResult<T>>("subscribe_channel", { channel });
}

export async function unsubscribeChannel(channel: StreamName): Promise<void> {
  return invoke("unsubscribe_channel", { channel });
}

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  
  isDevMode: () => invoke<boolean>("is_dev_mode"),

  setActiveTheme: (id: string | null) =>
    invoke<void>("set_active_theme", { name: id }),
  previewTheme: (theme: ThemeData) => invoke<void>("preview_theme", { theme }),
  setActiveLayout: (id: string | null) =>
    invoke<void>("set_active_layout", { id }),

  listThemes: () => invoke<ThemeInfo[]>("list_themes"),
  getTheme: (id: string) => invoke<ThemeData>("get_theme", { id }),
  saveTheme: (theme: ThemeData) => invoke<void>("save_theme", { theme }),
  deleteTheme: (id: string) => invoke<void>("delete_theme", { id }),
  openThemesFolder: () => invoke<void>("open_themes_folder"),
  restoreDefaults: () => invoke<void>("restore_defaults"),

  switchMonitor: () => invoke<void>("next_monitor"),
  getMonitorCount: () => invoke<number>("get_monitor_count"),

  setPreferences: (prefs: Preferences) =>
    invoke<void>("set_preferences", { prefs }),
  previewPreferences: (prefs: Preferences) =>
    invoke<void>("preview_preferences", { prefs }),
  generateTheme: (seedHex: string) =>
    invoke<void>("generate_theme", { seedHex }),

  listLayouts: () => invoke<LayoutInfo[]>("list_layouts"),
  getLayout: (id: string) => invoke<LayoutFile>("get_layout", { id }),
  saveLayout: (id: string, layout: LayoutFile) =>
    invoke<void>("save_layout", { id, layout }),
  deleteLayout: (id: string) => invoke<void>("delete_layout", { id }),
  renameLayout: (oldId: string, newName: string) =>
    invoke<string>("rename_layout", { oldId, newName }),
  updateLayoutGrid: (
    id: string,
    grid_rows: number,
    grid_cols: number,
    gap: number,
    padding: number,
  ) =>
    invoke<void>("update_layout_grid", {
      id,
      grid_rows,
      grid_cols,
      gap,
      padding,
    }),
  openLayoutsFolder: () => invoke<void>("open_layouts_folder"),

  updateWidget: (id: string, config: WidgetConfig) =>
    invoke<void>("update_widget", { widgetId: id, config }),

  openSettings: () => invoke<void>("open_settings"),
  closeSettings: () => invoke<void>("close_settings"),
  toggleSettingsVisibility: () => invoke<void>("toggle_settings_visibility"),

  togglePlayback: () => invoke<void>("toggle_playback"),
  nextTrack: () => invoke<void>("next_track"),
  prevTrack: () => invoke<void>("prev_track"),

  exitProgram: () => invoke<void>("exit_program"),

  logFromFrontend: (
    level: string,
    module: string,
    message: string,
    hint?: string,
  ) => invoke<void>("log_from_frontend", { level, module, message, hint }),

  // persistence
  // key-value store
  getKeyValue: (key: string, scope: Scope) =>
    invoke<string | null>("get_kv", { key, scope }),
  setKeyValue: (key: string, value: string, scope: Scope) =>
    invoke<void>("set_kv", { key, value, scope }),
  deleteKeyValue: (key: string, scope: Scope) =>
    invoke<void>("delete_kv", { key, scope, strict: false }),
  listKeyValues: (scope: Scope) =>
    invoke<string[]>("list_kv", { scope }),
  // object store
  getObject: <T extends object>(
    key: string,
    scope: Scope,
    collection?: string,
  ) => invoke<T | null>("get_object", { key, scope, collection }),
  setObject: <T extends object>(
    key: string,
    value: T,
    scope: Scope,
    collection?: string,
  ) => invoke<void>("set_object", { key, value, scope, collection }),
  deleteObject: (key: string, scope: Scope, collection?: string) =>
    invoke<void>("delete_object", { key, scope, collection, strict: false }),
  listObjects: (scope: Scope, collection?: string) =>
    invoke<string[]>("list_objects", { scope, collection }),
};
