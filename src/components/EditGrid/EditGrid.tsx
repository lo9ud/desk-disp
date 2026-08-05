import { CSSProperties, useState } from "react";
import { WidgetPlacement } from "../../ffi_types";
import { useEditMode } from "../../context/EditModeContext";
import { useWidgetInstanceIds } from "../../registry/instanceRegistry";
import { errorSeverity } from "../../utils/widgetErrors";
import { AddWidgetModal } from "./AddWidgetModal";
import { ConfirmSaveModal } from "./ConfirmSaveModal";
import { EditBar } from "./EditBar";
import { EmptyCells } from "./EmptyCells";
import {
  computeEmptyCells,
  computeOccupied,
  defaultSettings,
  deriveErrorState,
  gridContainerStyle,
  gridItemStyle,
} from "./gridMath";
import { GridEdgeControls } from "./GridEdgeControls";
import { PaddingHandles } from "./PaddingHandles";
import styles from "./styles/grid.module.css";
import { AddTarget } from "./types";
import { useEdgeControls } from "./useEdgeControls";
import { useGridInteraction } from "./useGridInteraction";
import { useSaveFlow } from "./useSaveFlow";
import { useSizeErrors } from "./useSizeErrors";
import { WidgetTile } from "./WidgetTile";

export default function EditGrid() {
  const {
    draftGridDims: dims,
    widgetErrors,
    editRegistry,
    moveWidget,
    addWidget,
    removeWidget,
    updateGridDims,
    shiftWidgets,
    save,
    cancel,
  } = useEditMode();

  const allIds = useWidgetInstanceIds(editRegistry ?? undefined);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);
  const [gapOpen, setGapOpen] = useState(false);

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
  } = useGridInteraction(dims, editRegistry, moveWidget, updateGridDims);

  const sizeErrors = useSizeErrors(
    containerRef,
    dims,
    editRegistry,
    allIds,
    widgetErrors,
  );

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

  function handleAddWidget(defId: string) {
    if (!addTarget) return;
    const placement: WidgetPlacement = {
      col: addTarget.col,
      row: addTarget.row,
      col_span: 1,
      row_span: 1,
    };
    addWidget(defId, placement, defaultSettings(defId) as Record<string, any>);
    setAddTarget(null);
  }

  const occupied = computeOccupied(editRegistry, ghost, interaction);
  const emptyCells = computeEmptyCells(occupied, dims);

  return (
    <>
      <div
        ref={containerRef}
        className={styles.container}
        style={gridContainerStyle(dims)}
      >
        {allIds.map((id) => {
          if (!editRegistry) return null;
          const hasError = errorWidgetIds.has(id);
          const errorClass = hasError
            ? allErrors.some(
                (e) => e.widgetIds.includes(id) && errorSeverity(e) === "error",
              )
              ? styles.widgetError
              : styles.widgetWarning
            : "";
          return (
            <WidgetTile
              key={id}
              instanceId={id}
              registry={editRegistry}
              isFlashing={flashingIds.has(id)}
              errorClass={errorClass}
              isSettingsOpen={openSettingsId === id}
              onToggleSettings={() =>
                setOpenSettingsId(openSettingsId === id ? null : id)
              }
              onRemove={() => removeWidget(id)}
              onDragStart={(e) => startDrag(e, id)}
              onResizeStart={(e, dir) => startResize(e, id, dir)}
            />
          );
        })}

        <EmptyCells
          emptyCells={emptyCells}
          onSelect={(col, row) => setAddTarget({ col, row })}
        />

        {ghost && (
          <div
            className={`${styles.ghost} ${ghost.valid ? styles.valid : styles.invalid}`}
            style={gridItemStyle(ghost.placement)}
          />
        )}

        <PaddingHandles padding={dims.padding} onDragStart={startPaddingDrag} />

        <GridEdgeControls
          dims={dims}
          shiftWidgets={shiftWidgets}
          updateGridDims={updateGridDims}
          tryRemoveEdge={tryRemoveEdge}
        />
      </div>

      <EditBar
        errorCount={allErrors.length}
        hasBlockingErrors={hasBlockingErrors}
        cancel={cancel}
        saving={saving}
        handleSaveClick={handleSaveClick}
        gap={dims.gap}
        onGapPointerDown={handleGapPointerDown}
        onGapPointerMove={handleGapPointerMove}
        onGapPointerUp={handleGapPointerUp}
        gapOpen={gapOpen}
        onToggleGapOpen={() => setGapOpen((v) => !v)}
      />

      {addTarget && (
        <AddWidgetModal
          onAdd={handleAddWidget}
          onClose={() => setAddTarget(null)}
        />
      )}

      {confirmSaveOpen && (
        <ConfirmSaveModal
          errors={allErrors}
          onCancel={closeConfirm}
          onConfirm={performSave}
        />
      )}
    </>
  );
}
