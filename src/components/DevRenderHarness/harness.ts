import { useCallback, useEffect, useMemo, useState } from "react";
import { WidgetPlacement } from "../../ffi_types";
import type { WidgetDefinition } from "../../registry/defRegistry";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { useLatest } from "../../hooks/useLatest";
import { useResizeObserver } from "../../hooks/useResizeObserver";
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
  const settingsRef = useLatest(settings);

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

/** Small enough to still grab a handle on. */
const MIN_STAGE_PX = 32;

export const DEFAULT_STAGE_SPAN: Span = { cols: 2, rows: 2 };

export type Bound = "min" | "max";
export type ClampFlags = Record<Bound, boolean>;

/** A widget's declared bound on one side; a null axis is unbounded. */
export type DeclaredLimit = [number | null, number | null];

export function declaredLimit(
  def: WidgetDefinition | undefined,
  bound: Bound,
): DeclaredLimit {
  if (!def) return [null, null];
  return bound === "min" ? def.minSize : def.maxSize;
}

export function hasLimit(limit: DeclaredLimit): boolean {
  return limit[0] !== null || limit[1] !== null;
}

export function limitText([w, h]: DeclaredLimit): string {
  return `${w ?? "—"} × ${h ?? "—"}`;
}

function clampAxis(v: number, min: number | null, max: number | null): number {
  if (max !== null) v = Math.min(v, max);
  if (min !== null) v = Math.max(v, min);
  return Math.max(MIN_STAGE_PX, v);
}

function clampToLimits(
  size: Size,
  def: WidgetDefinition | undefined,
  clamp: ClampFlags,
): Size {
  const [minW, minH] = clamp.min ? declaredLimit(def, "min") : [null, null];
  const [maxW, maxH] = clamp.max ? declaredLimit(def, "max") : [null, null];
  return {
    w: clampAxis(size.w, minW, maxW),
    h: clampAxis(size.h, minH, maxH),
  };
}

export interface StageSize {
  /** Callback ref: the stage area remounts on every return from the mosaic. */
  areaRef: (el: HTMLDivElement | null) => void;
  area: Size | null;
  size: Size | null;
  /** Every write goes through here, so nothing can bypass the clamps. */
  setSize: (size: Size) => void;
  fill: () => void;
  reset: () => void;
  clamp: ClampFlags;
  toggleClamp: (bound: Bound) => void;
  /** Size the stage to the widget's own declared bound, per axis it declares. */
  applyLimit: (bound: Bound) => void;
}

/**
 * The stage's box size. Owned above `StageView` because the inspector drives it
 * too, and because holding it here keeps the size across a mosaic detour.
 */
export function useStageSize(def: WidgetDefinition | undefined): StageSize {
  const [area, setArea] = useState<Size | null>(null);
  const [size, setRaw] = useState<Size | null>(null);
  const [clamp, setClamp] = useState<ClampFlags>({ min: false, max: false });
  const areaRef = useResizeObserver<HTMLDivElement>((el) =>
    setArea({ w: el.clientWidth, h: el.clientHeight }),
  );

  useEffect(() => {
    if (!area) return;
    setRaw((prev) => prev ?? sizeOfSpan(DEFAULT_STAGE_SPAN, area));
  }, [area]);

  // A toggle, or a switch to a widget with different bounds, has to bite on the
  // size already on screen rather than waiting for the next drag.
  useEffect(() => {
    setRaw((prev) => {
      if (!prev) return prev;
      const next = clampToLimits(prev, def, clamp);
      return next.w === prev.w && next.h === prev.h ? prev : next;
    });
  }, [def, clamp]);

  const setSize = useCallback(
    (next: Size) => setRaw(clampToLimits(next, def, clamp)),
    [def, clamp],
  );

  const fill = useCallback(() => {
    if (area) setSize(area);
  }, [area, setSize]);

  const reset = useCallback(() => {
    if (area) setSize(sizeOfSpan(DEFAULT_STAGE_SPAN, area));
  }, [area, setSize]);

  const toggleClamp = useCallback(
    (bound: Bound) => setClamp((c) => ({ ...c, [bound]: !c[bound] })),
    [],
  );

  const applyLimit = useCallback(
    (bound: Bound) => {
      const [w, h] = declaredLimit(def, bound);
      setRaw((prev) =>
        prev ? clampToLimits({ w: w ?? prev.w, h: h ?? prev.h }, def, clamp) : prev,
      );
    },
    [def, clamp],
  );

  return {
    areaRef,
    area,
    size,
    setSize,
    fill,
    reset,
    clamp,
    toggleClamp,
    applyLimit,
  };
}

