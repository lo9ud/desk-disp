import { useEffect, useMemo, useRef, useState } from "react";
import { WidgetPlacement } from "../../ffi_types";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import type { GridPadding } from "../../utils/validation";

/**
 * Both views, and every mosaic tile, render this one instance. They differ only
 * in how big their container is, so sharing an instance means they share one
 * settings object and one persistence scope -- an applet under test holds the
 * same state everywhere it appears instead of N independent copies.
 */
export const HARNESS_INSTANCE_ID = "harness";

/** Inert: every render site supplies its own 1x1 Grid for the widget to fill. */
const HARNESS_PLACEMENT: WidgetPlacement = {
  col: 1,
  row: 1,
  col_span: 1,
  row_span: 1,
};

export const NO_PADDING: GridPadding = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export interface Size {
  w: number;
  h: number;
}

export function useHarnessInstance(
  defId: string | null,
  settings: Record<string, unknown>,
  runtimeKey: number,
): InstanceRegistry {
  // Read through a ref so a settings edit doesn't rebuild the registry (which
  // would drop the instance and remount the widget on every keystroke).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const registry = useMemo(() => {
    const r = new InstanceRegistry();
    if (defId) {
      r.add(HARNESS_INSTANCE_ID, defId, HARNESS_PLACEMENT, settingsRef.current);
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings is deliberately not a dep; runtimeKey forces a fresh instance
  }, [defId, runtimeKey]);

  useEffect(() => {
    if (!defId) return;
    // Reference-equal on the run right after a rebuild, since `add` above stored
    // this very object -- skipping keeps that first pass from re-notifying.
    if (registry.get(HARNESS_INSTANCE_ID)?.settings === settings) return;
    registry.updateSettings(HARNESS_INSTANCE_ID, settings);
  }, [registry, defId, settings]);

  return registry;
}

export interface Span {
  cols: number;
  rows: number;
}

/**
 * The harness's own reference grid
 */
export const HARNESS_GRID: Span = { cols: 6, rows: 6 };

/** The `span` fraction of `basis`. */
export function sizeOfSpan(span: Span, basis: Size): Size {
  return {
    w: (basis.w * span.cols) / HARNESS_GRID.cols,
    h: (basis.h * span.rows) / HARNESS_GRID.rows,
  };
}

/** Inverse of sizeOfSpan, rounded to the nearest whole span. */
export function spanOfSize(size: Size, basis: Size): Span {
  return {
    cols: Math.max(1, Math.round((size.w / basis.w) * HARNESS_GRID.cols)),
    rows: Math.max(1, Math.round((size.h / basis.h) * HARNESS_GRID.rows)),
  };
}

export function useViewportSize(): Size {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}
