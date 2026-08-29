import { useEffect } from "react";
import { useRuntime } from "../runtime/context";
import { applyTheme, themeDataToCss } from "../utils/config";

export function useThemeCss(): void {
  const runtime = useRuntime();
  useEffect(() => {
    runtime.config.get().then((config) => {
      if (config.active_theme) {
        runtime.themes
          .get(config.active_theme)
          .then((t) => applyTheme(themeDataToCss(t)));
      }
    });

    return runtime.events.on("theme::changed", ({ css }) => applyTheme(css));
  }, [runtime]);
}
