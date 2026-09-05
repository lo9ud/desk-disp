import { useCallback, useEffect, useMemo, useState } from "react";
import { WidgetPlacement } from "../../ffi_types";
import type { WidgetDefinition } from "../../registry/defRegistry";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { useLatest } from "../../hooks/useLatest";
import { useResizeObserver } from "../../hooks/useResizeObserver";
import type { GridPadding } from "../../ffi_types";

/**
 * The static id used for the single widget instance in the dev render harness.
 */
export const HARNESS_INSTANCE_ID = "harness";

/**
 * Static placement for the single widget instance in the dev render harness. 
 * 
 * The 'grid' is always 1x1, so the placement is always 1,1 with a span of 1x1.
 */
const HARNESS_PLACEMENT: WidgetPlacement = {
  col: 1,
  row: 1,
  col_span: 1,
  row_span: 1,
};

/**
 * Grid padding for the dev render harness. 
 * 
 * The harness is intended to show the widget in isolation, so no padding is applied or required.
 */
export const NO_PADDING: GridPadding = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

/**
 * The size of the grid container
 */
export interface Size {
  /** The width of the container */
  w: number;
  /** The height of the container */
  h: number;
}

/**
 * Creates a registry with a single instance for the dev render harness, and keeps it in sync with the given definition and settings.
 * 
 * The instance is always placed at 1,1 with a span of 1x1, with a static id of "harness".
 * 
 * @param defId - The definition id of the widget to render in the harness. If null, no instance is created.
 * @param settings - The settings to apply to the widget instance in the harness.
 * @param runtimeKey - A key that forces a fresh instance to be created when changed. This is useful for resetting the harness when switching between different widgets.
 * @returns A registry with a single instance for the dev render harness, kept in sync with the given definition and settings.
 */
export function useHarnessInstance(
  defId: string | null,
  settings: Record<string, unknown>,
  runtimeKey: number,
): InstanceRegistry {
  // Read through a ref so a settings edit doesn't rebuild the registry (which
  // would drop the instance and remount the widget on every keystroke).
  const latestSettings = useLatest(settings);

  const registry = useMemo(() => {
    const r = new InstanceRegistry();
    if (defId) {
      r.add(HARNESS_INSTANCE_ID, defId, HARNESS_PLACEMENT, latestSettings.current);
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

/**
 * The span of a widget in the dev render harness, in terms of the number of columns and rows it occupies in the grid.
 */
export interface Span {
  /** The number of columns the widget occupies in the grid. */
  cols: number;
  /** The number of rows the widget occupies in the grid. */
  rows: number;
}

/**
 * The grid size for the dev render harness. This is a static value, as the harness is intended to show the widget in isolation and does not need to be responsive.
 */
export const HARNESS_GRID: Span = { cols: 6, rows: 6 };

/**
 * Converts a {@link Span} (in terms of number of columns and rows) to a {@link Size} (in pixels) based on the given basis size.
 * 
 * @param span - The {@link Span} of the widget in terms of number of columns and rows.
 * @param basis - The basis size to convert the span to pixels. This is the {@link Size} of a single grid cell
 * @returns The {@link Size} of the widget in pixels, based on the given span and basis size.
 */
export function sizeOfSpan(span: Span, basis: Size): Size {
  return {
    w: (basis.w * span.cols) / HARNESS_GRID.cols,
    h: (basis.h * span.rows) / HARNESS_GRID.rows,
  };
}

/**
 * Converts a {@link Size} (in pixels) to a {@link Span} (in terms of number of columns and rows) based on the given basis size.
 * 
 * @param size - The {@link Size} of the widget in pixels.
 * @param basis - The basis size to convert the size to a span. This is the {@link Size} of a single grid cell.
 * @returns The {@link Span} of the widget in terms of number of columns and rows, based on the given size and basis size, rounded to the nearest whole number and clamped to a minimum of 1 column and 1 row.
 */
export function spanOfSize(size: Size, basis: Size): Span {
  return {
    cols: Math.max(1, Math.round((size.w / basis.w) * HARNESS_GRID.cols)),
    rows: Math.max(1, Math.round((size.h / basis.h) * HARNESS_GRID.rows)),
  };
}

/** The minimum width and height of the stage in pixels. */
const MIN_STAGE_PX = 32;

/** The default span of the stage in terms of number of columns and rows. */
export const DEFAULT_STAGE_SPAN: Span = { cols: 2, rows: 2 };

/** Whether a bound is minimum or maximum. */
export type Bound = "min" | "max";


/** 
 * The flags for clamping the stage size. 
 * 
 * Maps each {@link Bound} to a boolean indicating whether the stage size has an upper/lower limit applied.
 * */
export type ClampFlags = Record<Bound, boolean>;

/** The declared limiting size in a widgets definition. */
export type DeclaredLimit = [number | null, number | null];

/**
 * Get the declared limit for a widget definition and bound. Returns [null, null] if the definition is undefined.
 * 
 * @param def - The widget definition to get the declared limit from. If undefined, returns [null, null].
 * @param bound - The bound to get the declared limit for. Either "min" or "max".
 * @returns The declared limit for the widget definition and bound, as a tuple of [width, height]. If the definition is undefined, returns [null, null].
 */
export function declaredLimit(
  def: WidgetDefinition | undefined,
  bound: Bound,
): DeclaredLimit {
  if (!def) return [null, null];
  return bound === "min" ? def.minSize : def.maxSize;
}

/**
 * A utility function to check if a declared limit is set for either width or height.
 * 
 * @param limit - The limit being checked
 * @returns Whether the limit is set for either width or height. Returns true if either width or height is not null, false otherwise.
 */
export function hasLimit(limit: DeclaredLimit): boolean {
  return limit[0] !== null || limit[1] !== null;
}

/**
 * Formats a declared limit as a string for display purposes. If either width or height is null, it is represented as "—".
 * 
 * @param param0 - The declared limit to format, as a tuple of [width, height].
 * @returns The formatted string representation of the declared limit, in the format "width × height". If either width or height is null, it is represented as "—".
 */
export function limitText([w, h]: DeclaredLimit): string {
  return `${w ?? "—"} × ${h ?? "—"}`;
}

/**
 * Clamps a value to be within the given minimum and maximum bounds.
 * 
 * @param v - The value to clamp.
 * @param min - The minimum bound to clamp the value to. If null, no minimum bound is applied.
 * @param max - The maximum bound to clamp the value to. If null, no maximum bound is applied.
 * @returns The clamped value, which is guaranteed to be within the given minimum and maximum bounds, and at least {@link MIN_STAGE_PX}.
 */
function clampAxis(v: number, min: number | null, max: number | null): number {
  if (max !== null) v = Math.min(v, max);
  if (min !== null) v = Math.max(v, min);
  return Math.max(MIN_STAGE_PX, v);
}

/**
 * Given a {@link Size}, a widget definition, and a set of clamp flags, returns a new {@link Size} that is clamped to the declared limits of the widget definition based on the clamp flags.
 * 
 * @param size - The {@link Size} to clamp.
 * @param def - The widget definition to use for clamping. If undefined, no clamping is applied.
 * @param clamp - The {@link ClampFlags} to use for clamping. If a bound is set to true, the size will be clamped to the declared limit for that bound.
 * @returns A new {@link Size} that is clamped to the declared limits of the widget definition based on the clamp flags. If the widget definition is undefined, returns the original size.
 */
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

/**
 * The interface for the stage size, which provides methods for managing the size of the stage.
 */
export interface StageSize {
  /** A ref callback to attach to the stage container element, which will be used to measure the size of the container. */
  areaRef: (el: HTMLDivElement | null) => void;
  /** The size of the stage container, or null if the container has not been measured yet. */
  area: Size | null;
  /** The current size of the stage, or null if the size has not been set yet. */
  size: Size | null;
  
  /** Sets the size of the stage to the given size, clamped to the declared limits of the widget definition. */
  setSize: (size: Size) => void;
  /** Sets the size of the stage to fill the entire area of the container. */
  fill: () => void;
  /** Resets the size of the stage to the default span, clamped to the declared limits of the widget definition. */
  reset: () => void;
  /** The current clamp flags for the stage size, indicating whether the size is clamped to the declared limits of the widget definition. */
  clamp: ClampFlags;
  /** Toggles the clamp flag for the given bound, which will cause the stage size to be clamped to the declared limit for that bound. */
  toggleClamp: (bound: Bound) => void;
  
  /** Applies the declared limit for the given bound to the stage size, clamping the size to the declared limit for that bound. */
  applyLimit: (bound: Bound) => void;
}

/**
 * Constructs a {@link StageSize} object that manages the size of the stage based on the given widget definition and clamp flags.
 * 
 * @param def - The widget definition to use for clamping the stage size.
 * @returns The {@link StageSize} object
 */
export function useStageSize(def: WidgetDefinition | undefined): StageSize {
  const [area, setArea] = useState<Size | null>(null);
  const [requested, setRequested] = useState<Size | null>(null);
  const [clamp, setClamp] = useState<ClampFlags>({ min: false, max: false });
  const areaRef = useResizeObserver<HTMLDivElement>((el) =>
    setArea({ w: el.clientWidth, h: el.clientHeight }),
  );

  // Both the default seed and the clamp are a function of what is already in
  // render scope, so storing the result would only buy a second render per
  // change -- and would make a clamp toggle destroy the size it clamped.
  const base = requested ?? (area && sizeOfSpan(DEFAULT_STAGE_SPAN, area));
  const size = base && clampToLimits(base, def, clamp);

  const fill = useCallback(() => {
    if (area) setRequested(area);
  }, [area]);

  const reset = useCallback(() => setRequested(null), []);

  const toggleClamp = useCallback(
    (bound: Bound) => setClamp((c) => ({ ...c, [bound]: !c[bound] })),
    [],
  );

  const applyLimit = useCallback(
    (bound: Bound) => {
      const [w, h] = declaredLimit(def, bound);
      if (size) setRequested({ w: w ?? size.w, h: h ?? size.h });
    },
    [def, size],
  );

  return {
    areaRef,
    area,
    size,
    setSize: setRequested,
    fill,
    reset,
    clamp,
    toggleClamp,
    applyLimit,
  };
}

