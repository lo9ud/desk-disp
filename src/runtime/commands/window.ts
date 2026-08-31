import type { Transport } from "../transport";

/** Window and process-level control */
export interface WindowCommands {
  openSettings(): Promise<void>;
  closeSettings(): Promise<void>;
  toggleSettingsVisibility(): Promise<void>;
  nextMonitor(): Promise<void>;
  getMonitorCount(): Promise<number>;
  exit(): Promise<void>;
}

export function makeWindowCommands(t: Transport): WindowCommands {
  return {
    openSettings: () => t.invoke<void>("open_settings"),
    closeSettings: () => t.invoke<void>("close_settings"),
    toggleSettingsVisibility: () =>
      t.invoke<void>("toggle_settings_visibility"),
    nextMonitor: () => t.invoke<void>("next_monitor"),
    getMonitorCount: () => t.invoke<number>("get_monitor_count"),
    exit: () => t.invoke<void>("exit_program"),
  };
}
