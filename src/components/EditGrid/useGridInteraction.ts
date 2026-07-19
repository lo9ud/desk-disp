import { useCallback, useEffect, useRef, useState } from "react";
import { WidgetPlacement } from "../../ffi_types";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { GridDims } from "../../utils/validation";
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

const PADDING_MIN = 30;
const PADDING_STEP = 10;
const GAP_MIN = 10;
const GAP_STEP = 5;

export function useGridInteraction(
  dims: GridDims,
  editRegistry: InstanceRegistry | null,
  moveWidget: (id: string, placement: WidgetPlacement) => void,
  updateGridDims: (dims: Partial<GridDims>) => void,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const paddingDragRef = useRef<PaddingDragState | null>(null);
  const gapDragRef = useRef<{ startX: number; startGap: number } | null>(null);

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
          PADDING_MIN,
          Math.round((startPadding[edge] + sign * delta) / PADDING_STEP) *
            PADDING_STEP,
        );
        updateGridDims({ padding: { ...startPadding, [edge]: newVal } });
        return;
      }
      const ia = interactionRef.current;
      if (!ia || !containerRef.current || !editRegistry) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cell = posToCellCoord(e.clientX, e.clientY, rect, dims);
      const placement = computeGhostPlacement(ia, cell, dims);
      const valid = checkGhostValid(
        placement,
        ia.instanceId,
        dims,
        editRegistry,
      );
      setGhost({ placement, valid });
    },
    [dims, editRegistry, updateGridDims],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (paddingDragRef.current) {
        containerRef.current?.releasePointerCapture(e.pointerId);
        paddingDragRef.current = null;
        return;
      }
      const ia = interactionRef.current;
      if (!ia) return;
      containerRef.current?.releasePointerCapture(e.pointerId);
      if (ghost?.valid) {
        moveWidget(ia.instanceId, ghost.placement);
      }
      setInteraction(null);
      setGhost(null);
    },
    [ghost, moveWidget],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  function startPaddingDrag(e: React.PointerEvent, edge: PaddingEdge) {
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    paddingDragRef.current = {
      edge,
      startXY: edge === "top" || edge === "bottom" ? e.clientY : e.clientX,
      startPadding: dims.padding,
    };
  }

  function handleGapPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    gapDragRef.current = { startX: e.clientX, startGap: dims.gap };
  }

  function handleGapPointerMove(e: React.PointerEvent) {
    if (!gapDragRef.current) return;
    const delta = e.clientX - gapDragRef.current.startX;
    updateGridDims({
      gap: Math.max(
        GAP_MIN,
        Math.round((gapDragRef.current.startGap + delta / 2) / GAP_STEP) *
          GAP_STEP,
      ),
    });
  }

  function handleGapPointerUp() {
    gapDragRef.current = null;
  }

  function startDrag(e: React.PointerEvent, instanceId: string) {
    if (!containerRef.current || !editRegistry) return;
    const inst = editRegistry.get(instanceId);
    if (!inst) return;
    const p = inst.placement;
    const rect = containerRef.current.getBoundingClientRect();
    const cell = posToCellCoord(e.clientX, e.clientY, rect, dims);
    const ia: DragInteraction = {
      kind: "move",
      instanceId,
      originalPlacement: p,
      grabOffsetCol: cell.col - p.col,
      grabOffsetRow: cell.row - p.row,
    };
    containerRef.current.setPointerCapture(e.pointerId);
    setInteraction(ia);
    setGhost({ placement: p, valid: true });
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
