import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ipc } from "../ipc";

type DevModeToolboxSettings = {
  showToolbox: boolean;
  displayWidgetCells: boolean;
  displayWidgetUsedSpace: boolean;
  showMissingBackground: boolean;
};

type DevModeContextType = {
  // Sourced from backend, not user-editable
  active: boolean;

  // Toolbox Settings
  setToolboxSettings: (update: (settings: DevModeToolboxSettings) => DevModeToolboxSettings) => void;
  toolboxSettings: DevModeToolboxSettings;
};

const DEFAULT_DEV_MODE_CONTEXT: Omit<DevModeContextType, "setToolboxSettings"> = {
  active: false,
  toolboxSettings: {
    showToolbox: false,
    displayWidgetCells: false,
    displayWidgetUsedSpace: false,
    showMissingBackground: false,
  },
};

const DevModeContext = createContext<DevModeContextType>(DEFAULT_DEV_MODE_CONTEXT as DevModeContextType);

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  let [value, setValue] = useState<Omit<DevModeContextType, "setToolboxSettings">>(DEFAULT_DEV_MODE_CONTEXT);
  useEffect(() => {
    ipc.isDevMode().then((isDev) => {
      setValue((prev) => ({ ...prev, active: isDev }));
    });
  }, []);
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
