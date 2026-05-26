import { useEffect } from "react";
import { ipc, ipcListen } from "../ipc";
import { applyTheme, themeDataToCss } from "../utils/config";

export function useThemeCss(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    ipc.getConfig().then((config) => {
      if (config.active_theme) {
        ipc.getTheme(config.active_theme).then((t) => applyTheme(themeDataToCss(t)));
      }
    });

    ipcListen("theme::changed", ({ css }) => applyTheme(css)).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);
}
