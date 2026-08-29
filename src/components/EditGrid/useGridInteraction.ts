import { useCallback, useEffect, useRef, useState } from "react";
import { WidgetPlacement } from "../../ffi_types";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { GridDims } from "../../utils/validation";
import { beginDragCursor, endDragCursor } from "./dragCursor";
import { checkGhostValid, computeGhostPlacement, posToCellCoord } from "./gridMath";
import {
  DragInteraction,
  GhostState,
  Interaction,
  PaddingDragState,
  PaddingEdge,
  ResizeDir,
  ResizeInteraction,
} from "./types";

const PADDING_STEP = 10;
const GAP_STEP = 5;

/** Pointer travel below this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;

const RESIZE_CURSORS: Record<ResizeDir, string> = {
  tl: "nwse-resize",
  br: "nwse-resize",
  tr: "nesw-resize",
  bl: "nesw-resize",
  t: "ns-resize",
  b: "ns-resize",
  l: "ew-resize",
  r: "ew-resize",
};

export function useGridInteraction(
  dims: GridDims,
  editRegistry: InstanceRegistry | null,
  moveWidget: (id: string, placement: WidgetPlacement) => void,
  updateGridDims: (dims: Partial<GridDims>) => void,
  onTrueClick?: (instanceId: string) => void,
  onDragBegin?: (instanceId: string) => void,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const paddingDragRef = useRef<PaddingDragState | null>(null);
  const gapDragRef = useRef<{ startX: number; startGap: number } | null>(null);
  const pendingDragRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (paddingDragRef.current) {
        const { edge, startXY, startPadding } = paddingDragRef.current;
        const isVertical = edge === "top" || edge === "bottom";
        const delta = (isVertical ? e.clientY : e.clientX) - startXY;
        const sign = edge === "top" || edge === "left" ? 1 : -1;
        const newVal = Math.max(
          0,
          Math.round((startPadding[edge] + sign * delta) / PADDING_STEP) *
            PADDING_STEP,
        );
        updateGridDims({ padding: { ...startPadding, [edge]: newVal } });
        return;
      }
      const ia = interactionRef.current;
      if (!ia || !containerRef.current || !editRegistry) return;
      if (ia.kind === "move" && pendingDragRef.current && !pendingDragRef.current.moved) {
        const { startX, startY } = pendingDragRef.current;
        if (
          Math.hypot(e.clientX - startX, e.clientY - startY) <
          DRAG_THRESHOLD_PX
        ) {
          return;
        }
        pendingDragRef.current.moved = true;
        beginDragCursor("grabbing");
        onDragBegin?.(ia.instanceId);
      }
      const cell = posToCellCoord(e.clientX, e.clientY, containerRef.current, dims);
      const placement = computeGhostPlacement(ia, cell, dims);
      const valid = checkGhostValid(
        placement,
        ia.instanceId,
        dims,
        editRegistry,
      );
      setGhost({ placement, valid });
    },
    [dims, editRegistry, updateGridDims, onDragBegin],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (paddingDragRef.current) {
        containerRef.current?.releasePointerCapture(e.pointerId);
        paddingDragRef.current = null;
        endDragCursor();
        return;
      }
      const ia = interactionRef.current;
      if (!ia) return;
      containerRef.current?.releasePointerCapture(e.pointerId);
      const wasTrueClick =
        ia.kind === "move" &&
        pendingDragRef.current !== null &&
        !pendingDragRef.current.moved;
      pendingDragRef.current = null;
      endDragCursor();
      if (wasTrueClick) {
        onTrueClick?.(ia.instanceId);
      } else if (ghost?.valid) {
        moveWidget(ia.instanceId, ghost.placement);
      }
      setInteraction(null);
      setGhost(null);
    },
    [ghost, moveWidget, onTrueClick],
  );

  const handlePointerCancel = useCallback(() => {
    paddingDragRef.current = null;
    pendingDragRef.current = null;
    gapDragRef.current = null;
    endDragCursor();
    setInteraction(null);
    setGhost(null);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

  // If the component unmounts mid-drag, don't strand the forced cursor.
  useEffect(() => endDragCursor, []);

  function startPaddingDrag(e: React.PointerEvent, edge: PaddingEdge) {
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    paddingDragRef.current = {
      edge,
      startXY: edge === "top" || edge === "bottom" ? e.clientY : e.clientX,
      startPadding: dims.padding,
    };
    beginDragCursor(
      edge === "top" || edge === "bottom" ? "ns-resize" : "ew-resize",
    );
  }

  function handleGapPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    gapDragRef.current = { startX: e.clientX, startGap: dims.gap };
    beginDragCursor("ew-resize");
  }

  function handleGapPointerMove(e: React.PointerEvent) {
    if (!gapDragRef.current) return;
    const delta = e.clientX - gapDragRef.current.startX;
    updateGridDims({
      gap: Math.max(
        0,
        Math.round((gapDragRef.current.startGap + delta / 2) / GAP_STEP) *
          GAP_STEP,
      ),
    });
  }

  function handleGapPointerUp() {
    gapDragRef.current = null;
    endDragCursor();
  }

  function startDrag(e: React.PointerEvent, instanceId: string) {
    if (!containerRef.current || !editRegistry) return;
    const inst = editRegistry.get(instanceId);
    if (!inst) return;
    const p = inst.placement;
    const cell = posToCellCoord(e.clientX, e.clientY, containerRef.current, dims);
    const ia: DragInteraction = {
      kind: "move",
      instanceId,
      originalPlacement: p,
      grabOffsetCol: cell.col - p.col,
      grabOffsetRow: cell.row - p.row,
    };
    containerRef.current.setPointerCapture(e.pointerId);
    pendingDragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    setInteraction(ia);
    // Ghost is deferred until the drag threshold is crossed, so a plain
    // click never flashes one.
  }

  function startResize(e: React.PointerEvent, instanceId: string, dir: ResizeDir) {
    if (!containerRef.current || !editRegistry) return;
    const inst = editRegistry.get(instanceId);
    if (!inst) return;
    const ia: ResizeInteraction = {
      kind: "resize",
      instanceId,
      originalPlacement: inst.placement,
      dir,
    };
    containerRef.current.setPointerCapture(e.pointerId);
    setInteraction(ia);
    setGhost({ placement: inst.placement, valid: true });
    beginDragCursor(RESIZE_CURSORS[dir]);
  }

  return {
    containerRef,
    ghost,
    interaction,
    startDrag,
    startResize,
    startPaddingDrag,
    handleGapPointerDown,
    handleGapPointerMove,
    handleGapPointerUp,
  };
}
