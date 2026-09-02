import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WidgetPlacement } from "../../ffi_types";
import { useEnterTransition } from "../../hooks/useEnterTransition";
import { useViewportSize } from "../../hooks/useViewportSize";
import { useEditMode } from "../../context/EditModeContext";
import { getWidgetDefinition } from "../../registry/defRegistry";
import {
  InstanceRegistry,
  useWidgetInstanceIds,
} from "../../registry/instanceRegistry";
import { defaultSettingsForWidget } from "../../registry/settingsDefaults";
import { errorSeverity } from "../../utils/widgetErrors";
import { AddButton } from "./band/AddButton";
import { EdgeChips } from "./band/EdgeChips";
import { Notch } from "./band/Notch";
import { PaddingPills } from "./band/PaddingPills";
import { ConfirmCancelModal } from "./ConfirmCancelModal";
import { ConfirmSaveModal } from "./ConfirmSaveModal";
import { EmptyCells } from "./EmptyCells";
import {
  checkGhostValid,
  computeEmptyCells,
  computeOccupied,
  deriveErrorState,
  firstFitCell,
  gridContainerStyle,
  gridItemStyle,
  posToCellCoord,
} from "./gridMath";
import { AddRail } from "./rail/AddRail";
import { SettingsPanel } from "./settings/SettingsPanel";
import { Rect } from "../../utils/placement";
import { useUiController, useUiFlag } from "../../ui/context";
import styles from "./styles/grid.module.css";
import { GhostState, PaddingEdge } from "./types";
import { useEdgeControls } from "./useEdgeControls";
import { useEditKeyLadder } from "./useEditKeyLadder";
import { useGridInteraction } from "./useGridInteraction";
import { useSaveFlow } from "./useSaveFlow";
import { useSizeErrors } from "./useSizeErrors";
import { WidgetTile } from "./WidgetTile";

/** Drives the band inset animation: full-bleed on mount, inset once entered,
 *  and back to full-bleed while closing before actually leaving edit mode. */
function useBandTransition(onExited: () => void) {
  const [closing, setClosing] = useState(false);
  const { shown, finishExit } = useEnterTransition(!closing, 280, onExited);

  return {
    bandOpen: shown,
    closing,
    beginExit: () => setClosing(true),
    handleTransitionEnd: (e: React.TransitionEvent, container: HTMLElement | null) => {
      if (closing && e.target === container && e.propertyName === "top") {
        finishExit();
      }
    },
  };
}

/** Synthetic instance id for placement validation of a not-yet-added widget;
 *  never collides with real ids and the self-skip in checkGhostValid is inert. */
const RAIL_PLACE_ID = "__rail_place__";

export default function EditGrid() {
  const {
    dirty,
    draftGridDims: dims,
    widgetErrors,
    editRegistry,
    moveWidget,
    addWidget,
    removeWidget,
    updateGridDims,
    updateWidgetSettings,
    shiftWidgets,
    save,
    cancel,
  } = useEditMode();

  const ui = useUiController();
  const tourActive = useUiFlag("tourActive");
  const saveSuppressed = useUiFlag("editSaveSuppressed");

  // Edit mode renders before the draft registry exists on the very first pass;
  // an empty stand-in keeps the hook call unconditional.
  const emptyRegistry = useMemo(() => new InstanceRegistry(), []);
  const allIds = useWidgetInstanceIds(editRegistry ?? emptyRegistry);
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [paddingGuideEdge, setPaddingGuideEdge] = useState<PaddingEdge | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Add mode: null = off; pendingCell = where a rail click will place.
  const [addMode, setAddMode] = useState<{
    pendingCell: { col: number; row: number } | null;
  } | null>(null);
  const [railMounted, setRailMounted] = useState(false);
  const [placeGhost, setPlaceGhost] = useState<GhostState | null>(null);
  const [noSpace, setNoSpace] = useState(false);
  const pendingSettingsIdRef = useRef<string | null>(null);

  const viewport = useViewportSize();
  const railW = Math.min(400, Math.max(320, viewport.w * 0.25));
  const addScale = (viewport.w - railW) / viewport.w;

  const { bandOpen, closing, beginExit, handleTransitionEnd } =
    useBandTransition(cancel);

  const handleTrueClick = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);
  const handleDragBegin = useCallback((id: string) => setSelectedId(id), []);

  const {
    containerRef,
    ghost,
    interaction,
    startDrag,
    startResize,
    startPaddingDrag,
    handleGapPointerDown,
    handleGapPointerMove,
    handleGapPointerUp,
  } = useGridInteraction(
    dims,
    editRegistry,
    moveWidget,
    updateGridDims,
    handleTrueClick,
    handleDragBegin,
  );

  // The settings panel belongs to the selected widget; selection moving away
  // takes it with it.
  useEffect(() => {
    if (openSettingsId && openSettingsId !== selectedId) {
      setOpenSettingsId(null);
    }
  }, [selectedId, openSettingsId]);

  // Measured from the live tile so the panel can be placed beside it. Tracked
  // in state (not read at render) so a move/resize of the edited widget
  // re-places the panel.
  const [settingsAnchor, setSettingsAnchor] = useState<Rect | null>(null);
  const [settingsBounds, setSettingsBounds] = useState<Rect | null>(null);
  // Allows forcing rerender and remeasurement of the anchor after the stage has completed animations
  const [stageSettled, setStageSettled] = useState(0);
  useLayoutEffect(() => {
    if (!openSettingsId) {
      setSettingsAnchor(null);
      setSettingsBounds(null);
      return;
    }
    const el = tileRefs.current.get(openSettingsId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSettingsAnchor({ x: r.left, y: r.top, w: r.width, h: r.height });
    // The grid area, so the panel can't be placed over the band chrome.
    const c = containerRef.current?.getBoundingClientRect();
    if (c) setSettingsBounds({ x: c.left, y: c.top, w: c.width, h: c.height });
  }, [openSettingsId, allIds, dims, ghost, containerRef, stageSettled]);

  // Settings and the add rail are mutually exclusive: both want the same
  // screen space, and opening settings over the rail looked accidental.
  function toggleSettings(id: string) {
    setSelectedId(id);
    exitAddMode();
    setOpenSettingsId((prev) => (prev === id ? null : id));
  }

  function closeSettings() {
    setOpenSettingsId(null);
  }

  const sizeErrors = useSizeErrors(dims, editRegistry, allIds, widgetErrors);

  const { flashingIds, tryRemoveEdge } = useEdgeControls(
    dims,
    editRegistry,
    shiftWidgets,
    updateGridDims,
  );

  const allErrors = [...widgetErrors, ...sizeErrors];
  const { hasBlockingErrors, hasWarnings, errorWidgetIds } =
    deriveErrorState(allErrors);

  const { saving, confirmSaveOpen, handleSaveClick, performSave, closeConfirm } =
    useSaveFlow(save, hasBlockingErrors, hasWarnings);

  const occupied = computeOccupied(editRegistry, ghost, interaction);
  const emptyCells = computeEmptyCells(occupied, dims);

  function enterAddMode(pendingCell: { col: number; row: number } | null) {
    setSelectedId(null);
    setOpenSettingsId(null);
    setNoSpace(false);
    setAddMode({ pendingCell });
    setRailMounted(true);
  }

  function exitAddMode() {
    setAddMode(null);
    setPlaceGhost(null);
    setNoSpace(false);
  }

  /** Add the widget, leave add mode, and select it; settings open after the
   *  stage has animated back to 1:1.
   *
   *  `settings` is the gallery preset the card was showing when it was picked,
   *  so what lands on the grid is what the user was looking at. Falls back to
   *  the plain defaults for any caller that isn't the rail. */
  function placeWidget(
    defId: string,
    placement: WidgetPlacement,
    settings?: Record<string, any>,
  ) {
    const newId = addWidget(
      defId,
      placement,
      settings ?? (defaultSettingsForWidget(defId) as Record<string, any>),
    );
    exitAddMode();
    if (!newId) return;
    setSelectedId(newId);
    const def = getWidgetDefinition(defId);
    if (def?.settingsDef && Object.keys(def.settingsDef).length > 0) {
      pendingSettingsIdRef.current = newId;
    }
  }

  // Deferred settings-open: wait out the stage's scale-back transition so the
  // panel is placed against the tile's settled, unscaled rect.
  useEffect(() => {
    if (addMode || !pendingSettingsIdRef.current) return;
    const id = pendingSettingsIdRef.current;
    const t = window.setTimeout(() => {
      pendingSettingsIdRef.current = null;
      setSelectedId(id);
      setOpenSettingsId(id);
    }, 260);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMode]);

  function handleRailPick(defId: string, settings?: Record<string, any>) {
    if (!editRegistry) return;
    let target = addMode?.pendingCell ?? null;
    if (target && occupied.has(`${target.col},${target.row}`)) target = null;
    target ??= firstFitCell(occupied, dims);
    if (!target) {
      setNoSpace(true);
      return;
    }
    placeWidget(
      defId,
      { col: target.col, row: target.row, col_span: 1, row_span: 1 },
      settings,
    );
  }

  function railPlacementAt(x: number, y: number): WidgetPlacement | null {
    if (!containerRef.current) return null;
    const cell = posToCellCoord(x, y, containerRef.current, dims);
    return { col: cell.col, row: cell.row, col_span: 1, row_span: 1 };
  }

  function handleRailGhostMove(_defId: string, x: number, y: number) {
    if (!editRegistry) return;
    const placement = railPlacementAt(x, y);
    if (!placement) return;
    setPlaceGhost({
      placement,
      valid: checkGhostValid(placement, RAIL_PLACE_ID, dims, editRegistry),
    });
  }

  function handleRailDrop(
    defId: string,
    x: number,
    y: number,
    settings?: Record<string, any>,
  ) {
    setPlaceGhost(null);
    if (!editRegistry) return;
    const placement = railPlacementAt(x, y);
    if (!placement) return;
    if (!checkGhostValid(placement, RAIL_PLACE_ID, dims, editRegistry)) return;
    placeWidget(defId, placement, settings);
  }

  function handleCancelClick() {
    if (dirty) setConfirmCancelOpen(true);
    else beginExit();
  }

  // Stable handle over a live ref: this component re-renders on every ghost
  // drag, so a handle rebuilt from state would churn the registration.
  const gridLatest = useRef({
    selectedId,
    openSettingsId,
    addMode,
    allIds,
    dims,
    editRegistry,
  });
  gridLatest.current = {
    selectedId,
    openSettingsId,
    addMode,
    allIds,
    dims,
    editRegistry,
  };
  const gridSurface = useMemo(
    () => ({
      read: () => {
        const s = gridLatest.current;
        return {
          selected: s.selectedId,
          settingsOpen: s.openSettingsId,
          addOpen: s.addMode !== null,
          widgetIds: s.allIds,
          grid: { cols: s.dims.cols, rows: s.dims.rows },
          placementOf: (id: string) => s.editRegistry?.get(id)?.placement,
        };
      },
      setSelection: ({
        selected,
        settingsOpen,
      }: {
        selected: string | null;
        settingsOpen: string | null;
      }) => {
        // Drop any deferred auto-open, or its timer lands after this and
        // reopens a panel the caller just asked to close.
        pendingSettingsIdRef.current = null;
        setSelectedId(settingsOpen ?? selected);
        setOpenSettingsId(settingsOpen);
      },
      setAddOpen: (open: boolean) => {
        if (open) enterAddMode(null);
        else exitAddMode();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => ui.registerSurface("editGrid", gridSurface), [ui, gridSurface]);

  useEditKeyLadder({
    suspended: closing,
    tourActive: tourActive.value,
    confirmSaveOpen,
    closeConfirmSave: closeConfirm,
    confirmCancelOpen,
    closeConfirmCancel: () => setConfirmCancelOpen(false),
    addOpen: addMode !== null,
    closeAdd: exitAddMode,
    settingsOpen: openSettingsId !== null,
    closeSettings,
    hasSelection: selectedId !== null,
    deselect: () => setSelectedId(null),
    onCancel: handleCancelClick,
    onSave: handleSaveClick,
    saving,
  });

  const stageStyle = addMode
    ? {
        transform: `translateY(${(viewport.h * (1 - addScale)) / 2}px) scale(${addScale})`,
      }
    : undefined;

  return (
    <>
      <div className={styles.editViewport} data-entered={bandOpen || undefined}>
        <div
          className={styles.editStage}
          style={stageStyle}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && e.propertyName === "transform") {
              setStageSettled((n) => n + 1);
            }
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <div
            ref={containerRef}
            className={styles.container}
            data-onboarding="edit-grid"
            style={gridContainerStyle(dims)}
            onTransitionEnd={(e) => handleTransitionEnd(e, containerRef.current)}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            {allIds.map((id) => {
              if (!editRegistry) return null;
              const hasError = errorWidgetIds.has(id);
              const errorClass = hasError
                ? allErrors.some(
                    (e) =>
                      e.widgetIds.includes(id) && errorSeverity(e) === "error",
                  )
                  ? styles.widgetError
                  : styles.widgetWarning
                : "";
              return (
                <WidgetTile
                  key={id}
                  instanceId={id}
                  registry={editRegistry}
                  isSelected={selectedId === id}
                  isFlashing={flashingIds.has(id)}
                  errorClass={errorClass}
                  isDimmed={openSettingsId !== null && openSettingsId !== id}
                  tileRef={(el) => {
                    if (el) tileRefs.current.set(id, el);
                    else tileRefs.current.delete(id);
                  }}
                  onToggleSettings={() => toggleSettings(id)}
                  onRemove={() => {
                    removeWidget(id);
                    setSelectedId((prev) => (prev === id ? null : prev));
                    if (openSettingsId === id) closeSettings();
                  }}
                  onDragStart={(e) => startDrag(e, id)}
                  onResizeStart={(e, dir) => startResize(e, id, dir)}
                />
              );
            })}

            {/* Nothing to see or click - a named cell a tour step can point at
                when it needs to show where something should end up. */}
            {tourActive.value && (
              <div
                className={styles.tourAnchor}
                data-onboarding="grid-centre"
                style={gridItemStyle({
                  col: Math.ceil(dims.cols / 2),
                  row: Math.ceil(dims.rows / 2),
                  col_span: 1,
                  row_span: 1,
                })}
              />
            )}

            <EmptyCells
              emptyCells={emptyCells}
              pendingCell={addMode?.pendingCell ?? null}
              onSelect={(col, row) => {
                setSelectedId(null);
                enterAddMode({ col, row });
              }}
            />

            {ghost && (
              <div
                className={`${styles.ghost} ${ghost.valid ? styles.valid : styles.invalid}`}
                style={gridItemStyle(ghost.placement)}
              />
            )}

            {placeGhost && (
              <div
                className={`${styles.ghost} ${placeGhost.valid ? styles.valid : styles.invalid}`}
                style={gridItemStyle(placeGhost.placement)}
              />
            )}

            {paddingGuideEdge && (
              <div className={styles.paddingGuide} data-edge={paddingGuideEdge} />
            )}

            {!addMode && (
              <PaddingPills
                padding={dims.padding}
                onDragStart={startPaddingDrag}
                onGuide={setPaddingGuideEdge}
              />
            )}
          </div>

          <EdgeChips
            dims={dims}
            shiftWidgets={shiftWidgets}
            updateGridDims={updateGridDims}
            tryRemoveEdge={tryRemoveEdge}
          />

        </div>

        {/* Outside .editStage: session-level chrome shouldn't ride the
            add-mode scale, only the grid and its own edge controls do. */}
        <Notch
          errors={allErrors}
          registry={editRegistry}
          hasBlockingErrors={hasBlockingErrors}
          saving={saving}
          saveDisabled={saveSuppressed.value}
          onSave={handleSaveClick}
          onCancel={handleCancelClick}
          gap={dims.gap}
          gapDisabled={addMode !== null}
          onGapPointerDown={handleGapPointerDown}
          onGapPointerMove={handleGapPointerMove}
          onGapPointerUp={handleGapPointerUp}
        />

        {!addMode && <AddButton onClick={() => enterAddMode(null)} />}

        {openSettingsId && editRegistry && (
          <SettingsPanel
            key={openSettingsId}
            instanceId={openSettingsId}
            registry={editRegistry}
            anchor={settingsAnchor}
            bounds={settingsBounds}
            onChange={updateWidgetSettings}
            onClose={closeSettings}
          />
        )}

        {railMounted && (
          <AddRail
            open={addMode !== null}
            width={railW}
            noSpace={noSpace}
            onPick={handleRailPick}
            onGhostMove={handleRailGhostMove}
            onDrop={handleRailDrop}
            onGhostCancel={() => setPlaceGhost(null)}
            onRequestClose={exitAddMode}
            onExited={() => setRailMounted(false)}
          />
        )}
      </div>

      {confirmCancelOpen && (
        <ConfirmCancelModal
          onKeepEditing={() => setConfirmCancelOpen(false)}
          onDiscard={() => {
            setConfirmCancelOpen(false);
            beginExit();
          }}
        />
      )}

      {confirmSaveOpen && (
        <ConfirmSaveModal
          errors={allErrors}
          registry={editRegistry}
          onCancel={closeConfirm}
          onConfirm={performSave}
        />
      )}
    </>
  );
}
