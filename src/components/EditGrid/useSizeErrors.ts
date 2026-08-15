import { useEffect, useMemo, useState } from "react";
import { getWidgetDefinition } from "../../registry/defRegistry";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { GridDims } from "../../utils/validation";
import { TooSmallError, WidgetError } from "../../utils/widgetErrors";
import { checkWidgetSize } from "./gridMath";

export function useSizeErrors(
  dims: GridDims,
  editRegistry: InstanceRegistry | null,
  allIds: readonly string[],
  widgetErrors: WidgetError[],
): TooSmallError[] {
  // Cell sizes are computed from the window, not the edit container: the
  // container is inset by the buffer band (and scaled during add mode), but
  // warnings must reflect the full-bleed layout the user will actually save.
  const [viewport, setViewport] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // widgetErrors in deps catches placement changes (setWidgetErrors always creates new ref).
  return useMemo((): TooSmallError[] => {
    if (!editRegistry) return [];
    const { w, h } = viewport;
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
  }, [allIds, dims, viewport, widgetErrors]);
}
