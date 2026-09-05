import { useState } from "react";
import { useTimeout } from "../../hooks/useTimeout";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { GridDims } from "../../utils/grid";
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

  // Clearing first and re-setting on the next frame is what restarts the CSS
  // animation when the same widget blocks twice in a row.
  useTimeout(() => setFlashingIds(new Set()), flashingIds.size > 0 ? 620 : null);

  function tryRemoveEdge(edge: RemoveEdge) {
    if (!editRegistry) return;
    const blocked = getBlockedWidgetIds(editRegistry, edge, dims);
    if (blocked.length > 0) {
      setFlashingIds(new Set());
      requestAnimationFrame(() => setFlashingIds(new Set(blocked)));
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
