import { useCallback, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  Squares2X2Icon,
  ViewfinderCircleIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import { useDevMode } from "../../context/DevModeContext";
import { Button } from "../../primitives/Button";
import { getWidgetDefinition } from "../../registry/defRegistry";
import { defaultSettingsForWidget } from "../../registry/settingsDefaults";
import { PreviewEnvironment } from "../../preview/PreviewEnvironment";
import { useUiController } from "../../ui/context";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { useHarnessInstance, useStageSize } from "./harness";
import { HarnessInspector } from "./HarnessInspector";
import { MosaicView } from "./MosaicView";
import { StageView } from "./StageView";
import { WidgetPicker } from "./WidgetPicker";
import styles from "./styles/DevRenderHarness.module.css";

type View = "stage" | "mosaic";

/** The dev-toolbox decorations worth reaching without leaving the harness. */
const DECORATIONS = {
  displayWidgetCells: "Cell bounds",
  displayWidgetUsedSpace: "Used space",
  showMissingBackground: "Missing background",
} as const;

/**
 * A workshop for authoring widgets
 */
export default function DevRenderHarness() {
  const { toggleDevRenderHarness, toolboxSettings, setToolboxSettings } =
    useDevMode();
  const ui = useUiController();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [view, setView] = useState<View>("stage");
  // Bumping this rebuilds the preview runtime: fresh memory persistence, fresh
  // mock streams, so first-load Suspense and applet first-use fallbacks re-run.
  const [runtimeKey, setRuntimeKey] = useState(0);

  const def = selectedId ? getWidgetDefinition(selectedId) : undefined;
  const registry = useHarnessInstance(selectedId, settings, runtimeKey);
  const stage = useStageSize(def);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setSettings(defaultSettingsForWidget(id));
  }, []);

  useWindowEvent("keydown", (e) => {
    if (e.key === "Escape") toggleDevRenderHarness();
  });

  // Prevent standard UI chrome from appearing while the harness is open
  useEffect(() => {
    const previous = ui.overrideOf("chromeRevealed");
    ui.setOverride("chromeRevealed", false);
    return () => ui.setOverride("chromeRevealed", previous);
  }, [ui]);

  return (
    <div className={styles.harness}>
      <div className={styles.header}>
        <span className={styles.title}>Widget Workshop</span>

        <div className={styles.viewSwitch}>
          <Button
            size="sm"
            variant={view === "stage" ? "accent" : "default"}
            onClick={() => setView("stage")}
          >
            <ViewfinderCircleIcon /> Stage
          </Button>
          <Button
            size="sm"
            variant={view === "mosaic" ? "accent" : "default"}
            onClick={() => setView("mosaic")}
          >
            <Squares2X2Icon /> Mosaic
          </Button>
        </div>

        <div className={styles.decorations}>
          {Object.entries(DECORATIONS).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={
                toolboxSettings[key as keyof typeof DECORATIONS]
                  ? "accent"
                  : "ghost"
              }
              onClick={() =>
                setToolboxSettings((s) => ({
                  ...s,
                  [key]: !s[key as keyof typeof DECORATIONS],
                }))
              }
            >
              {label}
            </Button>
          ))}
        </div>

        <div className={styles.headerActions}>
          <Button
            size="sm"
            title="Rebuild the preview runtime (fresh streams and persistence)"
            onClick={() => setRuntimeKey((n) => n + 1)}
          >
            <ArrowPathIcon /> Reset
          </Button>
          <Button
            variant="icon"
            title="Close (Esc)"
            aria-label="Close"
            onClick={toggleDevRenderHarness}
          >
            <XMarkIcon />
          </Button>
        </div>
      </div>

      <WidgetPicker selectedId={selectedId} onSelect={select} />

      <div className={styles.centre}>
        {def ? (
          <PreviewEnvironment key={runtimeKey}>
            {view === "stage" ? (
              <StageView registry={registry} def={def} stage={stage} />
            ) : (
              <MosaicView registry={registry} />
            )}
          </PreviewEnvironment>
        ) : (
          <div className={styles.empty}>
            Pick a widget to start. Arrow keys walk the list.
          </div>
        )}
      </div>

      <div className={styles.side}>
        {def ? (
          <HarnessInspector
            // Remount per widget so the preset stepper and the ephemeral
            // trigger results start clean rather than carrying over.
            key={def.id}
            def={def}
            settings={settings}
            onChange={(key, value) =>
              setSettings((prev) => ({ ...prev, [key]: value }))
            }
            onReplace={setSettings}
            onApplyLimit={view === "stage" ? stage.applyLimit : undefined}
          />
        ) : (
          <div className={styles.empty}>No widget selected.</div>
        )}
      </div>
    </div>
  );
}
