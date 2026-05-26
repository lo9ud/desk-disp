import { invoke } from "@tauri-apps/api/core";
import type { Config, LayoutFile, LayoutInfo, Preferences, ThemeData, ThemeInfo, WidgetConfig } from "../ffi_types";
import type { BackendEvents, ChannelName } from "./events";

export interface SubscribeResult<T extends ChannelName> {
  is_first_subscriber: boolean;
  last_value: BackendEvents[`stream::${T}`] | null;
}

export async function subscribeChannel<T extends ChannelName>(
  channel: T,
): Promise<SubscribeResult<T>> {
  return invoke<SubscribeResult<T>>("subscribe_channel", { channel });
}

export async function unsubscribeChannel(channel: ChannelName): Promise<void> {
  return invoke("unsubscribe_channel", { channel });
}

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),

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

  setPreferences: (prefs: Preferences) => invoke<void>("set_preferences", { prefs }),
  previewPreferences: (prefs: Preferences) => invoke<void>("preview_preferences", { prefs }),
  generateTheme: (seedHex: string) => invoke<void>("generate_theme", { seedHex }),

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
  ) => invoke<void>("update_layout_grid", { id, grid_rows, grid_cols, gap, padding }),
  openLayoutsFolder: () => invoke<void>("open_layouts_folder"),

  updateWidget: (id: string, config: WidgetConfig) =>
    invoke<void>("update_widget", { widgetId: id, config }),

  openSettings: () => invoke<void>("open_settings"),

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
};
