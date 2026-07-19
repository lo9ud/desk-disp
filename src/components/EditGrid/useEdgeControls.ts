import { useRef, useState } from "react";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { GridDims } from "../../utils/validation";
import { getBlockedWidgetIds } from "./gridMath";
import { RemoveEdge } from "./types";

export function useEdgeControls(
  dims: GridDims,
  editRegistry: InstanceRegistry | null,
  shiftWidgets: (
    colOffset: number,
    rowOffset: number,
    dimsDelta: Partial<GridDims>,
  ) => void,
  updateGridDims: (dims: Partial<GridDims>) => void,
) {
  const [flashingIds, setFlashingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function tryRemoveEdge(edge: RemoveEdge) {
    if (!editRegistry) return;
    const blocked = getBlockedWidgetIds(editRegistry, edge, dims);
    if (blocked.length > 0) {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlashingIds(new Set());
      requestAnimationFrame(() => {
        setFlashingIds(new Set(blocked));
        flashTimeoutRef.current = setTimeout(
          () => setFlashingIds(new Set()),
          620,
        );
      });
      return;
    }
    switch (edge) {
      case "top":
        shiftWidgets(0, -1, { rows: dims.rows - 1 });
        break;
      case "bottom":
        updateGridDims({ rows: dims.rows - 1 });
        break;
      case "left":
        shiftWidgets(-1, 0, { cols: dims.cols - 1 });
        break;
      case "right":
        updateGridDims({ cols: dims.cols - 1 });
        break;
    }
  }

  return { flashingIds, tryRemoveEdge };
}
