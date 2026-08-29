import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import "./widgets/register";
import Grid from "./widgets/Grid";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SettingsPage from "./pages/settings/SettingsPage";
import { LayoutFile, Preferences, WidgetPlacement } from "./ffi_types";
import { EditModeProvider, useEditMode } from "./context/EditModeContext";
import type { GridDims } from "./utils/validation";
import { Widgets } from "./widgets/widget";
import EditGrid from "./components/EditGrid";
import WindowControls from "./components/WindowControls";
import Onboarding from "./components/Onboarding";
import { PersistenceProvider } from "./context/PersistenceContext";
import type { AppRuntime } from "./runtime/AppRuntime";
import { genWidgetId } from "./registry/instanceRegistry";
import type { BackendEvents } from "./runtime/events";
import { useRuntime } from "./runtime/context";
import { useThemeCss } from "./hooks/useTheme";
import { logger } from "./utils/logger";
import { DevModeProvider, useDevMode } from "./context/DevModeContext";
import DevModeToolbox from "./components/DevModeToolbox";

const ALL_EVENTS: (keyof BackendEvents)[] = [
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
];

const eventLog = logger("events");
const { error } = logger("app");

function logEvent(
  window: string | undefined,
  event: keyof BackendEvents,
  payload: unknown,
) {
  eventLog.trace(
    event,
    `${window ? `[${window}] ` : ""}${JSON.stringify(payload).slice(0, 120)}`,
  );
}

function useEventDebugLog(
  window?: string,
  filter?: (event: keyof BackendEvents) => boolean,
) {
  const { events } = useRuntime();
  useEffect(() => {
    const unlistens = (filter ? ALL_EVENTS.filter(filter) : ALL_EVENTS).map(
      (event) => events.on(event, (payload) => logEvent(window, event, payload)),
    );
    return () => unlistens.forEach((off) => off());
  }, [events, filter]);
}

const windowLabel = getCurrentWindow().label;

// Demo helpers (preserved for widget prototyping)

const DEMO_PLACEMENTS: WidgetPlacement[][] = [
  [
    { col: 1, row: 1, col_span: 1, row_span: 1 },
    { col: 2, row: 1, col_span: 2, row_span: 1 },
    { col: 1, row: 2, col_span: 1, row_span: 2 },
    { col: 2, row: 2, col_span: 2, row_span: 2 },
    { col: 4, row: 1, col_span: 2, row_span: 3 },
    { col: 1, row: 4, col_span: 3, row_span: 2 },
    { col: 1, row: 6, col_span: 3, row_span: 1 },
    { col: 4, row: 4, col_span: 1, row_span: 3 },
    { col: 5, row: 4, col_span: 1, row_span: 3 },
  ],
  [
    { col: 1, row: 6, col_span: 1, row_span: 1 },
    { col: 1, row: 1, col_span: 1, row_span: 1 },
    { col: 5, row: 1, col_span: 1, row_span: 1 },
    { col: 5, row: 6, col_span: 1, row_span: 1 },
    { col: 3, row: 3, col_span: 1, row_span: 1 },
  ],
  [{ col: 1, row: 1, col_span: 6, row_span: 5 }],
];

export function registerDemoWidgets(
  runtime: AppRuntime,
  type: string,
  props?: Record<string, any>,
) {
  runtime.instances.clear();
  for (const placement of DEMO_PLACEMENTS[0]) {
    runtime.instances.add(genWidgetId(type), type, placement, props);
  }
}

/* Main display view  */

function MainContent({ gridDims }: { gridDims: GridDims }) {
  const { toolboxSettings } = useDevMode();
  const { active: editModeActive } = useEditMode();
  if (editModeActive) return <EditGrid />;
  return (
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
      <Onboarding />
      {toolboxSettings.showToolbox && <DevModeToolbox />}
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
  useEventDebugLog(windowLabel, (event) => !event.startsWith("stream"));

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
