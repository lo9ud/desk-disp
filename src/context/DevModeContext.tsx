import { createContext, useContext, useMemo, useState } from "react";
import { useRuntime } from "../runtime/context";

type DevModeToolboxSettings = {
  showToolbox: boolean;
  displayWidgetCells: boolean;
  displayWidgetUsedSpace: boolean;
  showMissingBackground: boolean;
};

type DevModeContextType = {
  // Sourced from the `--dev` CLI flag, not user-editable
  active: boolean;

  // Toolbox Settings
  setToolboxSettings: (update: (settings: DevModeToolboxSettings) => DevModeToolboxSettings) => void;
  toolboxSettings: DevModeToolboxSettings;
};

const DEFAULT_TOOLBOX_SETTINGS: DevModeToolboxSettings = {
  showToolbox: false,
  displayWidgetCells: false,
  displayWidgetUsedSpace: false,
  showMissingBackground: false,
};

const DevModeContext = createContext<DevModeContextType>({
  active: false,
  toolboxSettings: DEFAULT_TOOLBOX_SETTINGS,
} as DevModeContextType);

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const runtime = useRuntime();
  let [value, setValue] = useState<Omit<DevModeContextType, "setToolboxSettings">>(() => ({
    active: runtime.cli.dev,
    toolboxSettings: DEFAULT_TOOLBOX_SETTINGS,
  }));
  const contextValue = useMemo(() => {
    return {
      ...value,
      setToolboxSettings: (update: (settings: DevModeToolboxSettings) => DevModeToolboxSettings) => {
        setValue((prev) => ({ ...prev, toolboxSettings: update(prev.toolboxSettings) }));
      }
    };
  }, [value]);
  return <DevModeContext value={contextValue}>{children}</DevModeContext>;
}

export function useDevMode() {
  const ctx = useContext(DevModeContext);
  if (!ctx) throw new Error("useDevMode must be used inside DevModeProvider");
  return ctx;
}
