import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import "./widgets/register";
import Grid from "./widgets/Grid";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SettingsPage from "./pages/settings/SettingsPage";
import { LayoutFile, Preferences } from "./ffi_types";
import { EditModeProvider, useEditMode } from "./context/EditModeContext";
import type { GridDims } from "./utils/validation";
import { Widgets } from "./widgets/widget";
import EditGrid from "./components/EditGrid";
import WindowControls from "./components/WindowControls";
import Tour from "./onboarding/Tour";
import { PersistenceProvider } from "./context/PersistenceContext";
import { useRuntime } from "./runtime/context";
import { useThemeCss } from "./hooks/useTheme";
import { logger } from "./utils/logger";
import { DevModeProvider, useDevMode } from "./context/DevModeContext";
import DevModeToolbox from "./components/DevModeToolbox";

const { error } = logger("app");

const windowLabel = getCurrentWindow().label;

/* Main display view  */

function MainContent({ gridDims }: { gridDims: GridDims }) {
  const { toolboxSettings } = useDevMode();
  const { active: editModeActive } = useEditMode();
  return (
    <>
      {editModeActive ? (
        <EditGrid />
      ) : (
        <>
          <Grid
            cols={gridDims.cols}
            rows={gridDims.rows}
            gap={gridDims.gap}
            padding={gridDims.padding}
            className="container"
          >
            <Widgets />
          </Grid>
          <WindowControls />
          {toolboxSettings.showToolbox && <DevModeToolbox />}
        </>
      )}
      <Tour />
    </>
  );
}

function applyPreferences(prefs: Preferences) {
  const root = document.documentElement;
  root.style.setProperty(
    "--radius-widget",
    prefs.rounded ? "min(12px, 1.5vmin)" : "0px",
  );
  root.style.setProperty(
    "--color-surface",
    prefs.widget_transparent ? "transparent" : "",
  );
  root.style.setProperty(
    "--color-base",
    prefs.background_transparent ? "transparent" : "",
  );
  root.style.fontSize = `${prefs.font_scale}rem`;
}

function MainView({ activeLayoutId }: { activeLayoutId: string }) {
  const [gridDims, setGridDims] = useState<GridDims>({
    cols: 5,
    rows: 6,
    gap: 16,
    padding: { top: 36, right: 36, bottom: 36, left: 36 },
  });

  const runtime = useRuntime();
  const profileRef = useRef<LayoutFile | null>(null);

  useEffect(() => {
    runtime.config.get().then((config) => applyPreferences(config.preferences));
    const offChanged = runtime.events.on("preferences::changed", applyPreferences);
    const offPreview = runtime.events.on("preferences::preview", applyPreferences);
    return () => {
      offChanged();
      offPreview();
    };
  }, [runtime]);

  useEffect(() => {
    runtime.layouts
      .get(activeLayoutId)
      .then((layout) => {
        profileRef.current = layout;
        setGridDims({
          cols: layout.grid_cols,
          rows: layout.grid_rows,
          gap: layout.gap,
          padding: layout.padding,
        });
        runtime.instances.clear();
        for (const wc of layout.widgets) {
          runtime.instances.add(wc.id, wc.type, wc.placement, wc.options ?? {});
        }
      })
      .catch((_) => {
        error("Failed to load layout:", activeLayoutId);
      });
  }, [runtime, activeLayoutId]);

  const buildLayout = useCallback(
    (dims: GridDims): LayoutFile => {
      const base = profileRef.current ?? {
        id: activeLayoutId,
        name: "Layout",
        grid_rows: dims.rows,
        grid_cols: dims.cols,
        gap: dims.gap,
        padding: dims.padding,
        widgets: [] as LayoutFile["widgets"],
      };
      return {
        ...base,
        id: activeLayoutId,
        grid_rows: dims.rows,
        grid_cols: dims.cols,
        gap: dims.gap,
        padding: dims.padding,
        widgets: runtime.instances.getAll().map((inst) => ({
          id: inst.id,
          type: inst.definitionId,
          placement: inst.placement,
          options: inst.settings,
        })),
      };
    },
    [runtime, activeLayoutId],
  );

  const getLayout = useCallback(
    () => buildLayout(gridDims),
    [buildLayout, gridDims],
  );

  return (
    <EditModeProvider
      activeLayoutId={activeLayoutId}
      gridDims={gridDims}
      buildLayout={buildLayout}
      onGridDimsChange={setGridDims}
    >
      <PersistenceProvider
        activeLayoutId={activeLayoutId}
        getLayout={getLayout}
      >
        <MainContent gridDims={gridDims} />
      </PersistenceProvider>
    </EditModeProvider>
  );
}

/* App root  */

export default function App() {
  const runtime = useRuntime();
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  useThemeCss();

  useEffect(() => {
    runtime.config.get().then((config) => {
      setActiveLayoutId(config.active_layout ?? "default");
    });
    return runtime.events.on("layout::changed", ({ id }) =>
      setActiveLayoutId(id),
    );
  }, [runtime]);

  if (windowLabel === "settings") return <SettingsPage />;
  if (!activeLayoutId) return null;

  return (
    <DevModeProvider>
      <MainView activeLayoutId={activeLayoutId} />
    </DevModeProvider>
  );
}
