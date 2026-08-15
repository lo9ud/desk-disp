import { useRef, useState } from "react";
import { beginDragCursor, endDragCursor } from "../dragCursor";

const DRAG_THRESHOLD_PX = 4;

/**
 * Card-to-canvas drag for the add rail. Entirely separate from
 * useGridInteraction: the pointer is captured on the card element, so all
 * tracking runs through the card's own handlers, never the grid container's.
 */
export function useRailDrag(opts: {
  railRef: React.RefObject<HTMLDivElement | null>;
  onClick: (defId: string) => void;
  onGhostMove: (defId: string, clientX: number, clientY: number) => void;
  onDrop: (defId: string, clientX: number, clientY: number) => void;
  onGhostCancel: () => void;
}) {
  /** True while a card drag is outside the rail (rail ghosts itself). */
  const [placing, setPlacing] = useState(false);
  const dragRef = useRef<{
    defId: string;
    startX: number;
    startY: number;
    moved: boolean;
    outside: boolean;
  } | null>(null);

  function isOutsideRail(x: number, y: number): boolean {
    const rect = opts.railRef.current?.getBoundingClientRect();
    if (!rect) return true;
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  }

  function handleCardPointerDown(e: React.PointerEvent, defId: string) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      defId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      outside: false,
    };
  }

  function handleCardPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (
        Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <
        DRAG_THRESHOLD_PX
      ) {
        return;
      }
      d.moved = true;
      beginDragCursor("grabbing");
    }
    const outside = isOutsideRail(e.clientX, e.clientY);
    if (outside !== d.outside) {
      d.outside = outside;
      setPlacing(outside);
      if (!outside) opts.onGhostCancel();
    }
    if (outside) opts.onGhostMove(d.defId, e.clientX, e.clientY);
  }

  function handleCardPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    endDragCursor();
    setPlacing(false);
    if (!d.moved) {
      opts.onClick(d.defId);
    } else if (d.outside) {
      opts.onDrop(d.defId, e.clientX, e.clientY);
    } else {
      opts.onGhostCancel();
    }
  }

  function handleCardPointerCancel() {
    dragRef.current = null;
    endDragCursor();
    setPlacing(false);
    opts.onGhostCancel();
  }

  return {
    placing,
    handleCardPointerDown,
    handleCardPointerMove,
    handleCardPointerUp,
    handleCardPointerCancel,
  };
}
