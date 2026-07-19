import { RefObject, useEffect, useMemo, useState } from "react";
import { getWidgetDefinition } from "../../registry/defRegistry";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { GridDims } from "../../utils/validation";
import { TooSmallError, WidgetError } from "../../utils/widgetErrors";
import { checkWidgetSize } from "./gridMath";

export function useSizeErrors(
  containerRef: RefObject<HTMLDivElement | null>,
  dims: GridDims,
  editRegistry: InstanceRegistry | null,
  allIds: readonly string[],
  widgetErrors: WidgetError[],
): TooSmallError[] {
  const [containerSize, setContainerSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Derive size warnings from actual pixel dimensions vs widget minSize.
  // widgetErrors in deps catches placement changes (setWidgetErrors always creates new ref).
  return useMemo((): TooSmallError[] => {
    if (!containerSize || !editRegistry) return [];
    const { w, h } = containerSize;
    const { padding, gap, cols, rows } = dims;
    const cellW = (w - padding.left - padding.right - gap * (cols - 1)) / cols;
    const cellH = (h - padding.top - padding.bottom - gap * (rows - 1)) / rows;
    return editRegistry.getAll().flatMap((inst) => {
      const def = getWidgetDefinition(inst.definitionId);
      const err = checkWidgetSize(
        inst.id,
        inst.placement,
        def?.minSize ?? [null, null],
        cellW,
        cellH,
        gap,
      );
      return err ? [err] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIds, dims, containerSize, widgetErrors]);
}
