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
import {
  canonicalRegistry,
  genWidgetId,
} from "./registry/instanceRegistry";
import { PersistenceProvider } from "./context/PersistenceContext";
import { ipc, ipcListen } from "./ipc";
import type { BackendEvents } from "./ipc";
import { useThemeCss } from "./hooks/useTheme";
import { logger } from "./utils/logger";

const ALL_EVENTS: (keyof BackendEvents)[] = [
  "stream::system",
  "stream::media",
  "stream::visualizer",
  "stream::hardware",
  "config::changed",
  "theme::changed",
  "layout::changed",
  "widget::updated",
  "preferences::changed",
  "preferences::preview",
];

const eventLog = logger("events");
const {error} = logger("app");

function logEvent(window: string | undefined, event: keyof BackendEvents, payload: unknown) {
  // eventLog.trace(event, JSON.stringify(objectToTypes(payload)).slice(0, 120));
  eventLog.trace(event, `${window ? `[${window}] ` : ""}${JSON.stringify(payload).slice(0, 120)}`);
}

function detach(p: Promise<() => void>) {
  p.then((fn) => fn());
}

function useEventDebugLog(window?: string,filter?: (event: keyof BackendEvents) => boolean) {
  useEffect(() => {
    const unlistens = (filter ? ALL_EVENTS.filter(filter) : ALL_EVENTS).map((event) => ipcListen(event, (payload) => logEvent(window, event, payload)));
    return () => { unlistens.forEach(detach); };
  }, [filter]);
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
  [
    { col: 1, row: 1, col_span: 6, row_span: 5 },
  ],
];

export function registerDemoWidgets(
  type: string,
  props?: Record<string, any>,
) {
  canonicalRegistry.clear();
  for (const placement of DEMO_PLACEMENTS[0]) {
    canonicalRegistry.add(genWidgetId(type), type, placement, props);
  }
}

/* Main display view  */

function MainContent({ gridDims }: { gridDims: GridDims }) {
  const { active } = useEditMode();
  if (active) return <EditGrid />;
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
    </>
  );
}

function applyPreferences(prefs: Preferences) {
  const root = document.documentElement;
  root.style.setProperty("--radius-widget", prefs.rounded ? "min(12px, 1.5vmin)" : "0px");
  root.style.setProperty("--color-surface", prefs.widget_transparent ? "transparent" : "");
  root.style.setProperty("--color-base", prefs.background_transparent ? "transparent" : "");
  root.style.fontSize = `${prefs.font_scale}rem`;
}

function MainView({ activeLayoutId }: { activeLayoutId: string }) {
  const [gridDims, setGridDims] = useState<GridDims>({
    cols: 5,
    rows: 6,
    gap: 16,
    padding: { top: 36, right: 36, bottom: 36, left: 36 },
  });

  const profileRef = useRef<LayoutFile | null>(null);

  useEffect(() => {
    ipc.getConfig().then((config) => applyPreferences(config.preferences));
    const p1 = ipcListen("preferences::changed", applyPreferences);
    const p2 = ipcListen("preferences::preview", applyPreferences);
    return () => {
      p1.then((fn) => fn());
      p2.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    ipc.getLayout(activeLayoutId)
      .then((layout) => {
        profileRef.current = layout;
        setGridDims({
          cols: layout.grid_cols,
          rows: layout.grid_rows,
          gap: layout.gap,
          padding: layout.padding,
        });
        canonicalRegistry.clear();
        for (const wc of layout.widgets) {
          canonicalRegistry.add(wc.id, wc.type, wc.placement, wc.options ?? {});
        }
      })
      .catch((_) => {
          error("Failed to load layout:", activeLayoutId);
      });
  }, [activeLayoutId]);
  
  // let i = 0;
  // for (const def of getAllWidgetDefinitions()) {
  //   let row = Math.floor(i / 3) + 1;
  //   let col = (i % 3) + 1;
  //   registerWidgetInstance(hexRandom(12), def.id, { col, row, col_span: 1, row_span: 1 });
  //   i++;
  // }

  const buildLayout = useCallback((dims: GridDims): LayoutFile => {
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
      widgets: canonicalRegistry.getAll().map((inst) => ({
        id: inst.id,
        type: inst.definitionId,
        placement: inst.placement,
        options: inst.settings,
      })),
    };
  }, [activeLayoutId]);

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
      <PersistenceProvider activeLayoutId={activeLayoutId} getLayout={getLayout}>
        <MainContent gridDims={gridDims} />
      </PersistenceProvider>
    </EditModeProvider>
  );
}

/* App root  */

export default function App() {
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  useThemeCss();
  useEventDebugLog(windowLabel, (event) => !event.startsWith("stream"));

  useEffect(() => {
    ipc.getConfig().then((config) => {
      setActiveLayoutId(config.active_layout ?? "default");
    });

    let unlisten: (() => void) | null = null;
    ipcListen("layout::changed", ({ id }) => setActiveLayoutId(id)).then(
      (fn) => { unlisten = fn; },
    );
    return () => { unlisten?.(); };
  }, []);

  if (windowLabel === "settings") return <SettingsPage />;
  if (!activeLayoutId) return null;

  return <MainView activeLayoutId={activeLayoutId} />;
}
