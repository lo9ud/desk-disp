import { CSSProperties, createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { widgetPlacementToProps } from "../utils/config";
import styles from "./styles/widget.module.css";
import {
  getWidgetDefinition,
  WidgetSettingsDefinition,
  SettingType,
} from "../registry/defRegistry";
import {
  canonicalRegistry,
  InstanceRegistry,
  useWidgetInstance,
  useVisibleWidgetInstanceIds,
} from "../registry/instanceRegistry";
import { combineClassNames } from "../utils/format";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";

const WidgetInstanceIdContext = createContext<string | undefined>(undefined);

export type { GridSize } from "./Grid";
export { useGridSize } from "./Grid";

export type ColPlacementProps = { col: number; colSpan: number };
export type RowPlacementProps = { row: number; rowSpan: number };
export type WidgetPlacementProps = ColPlacementProps & RowPlacementProps;

type WidgetProps = WidgetPlacementProps & {
  children?: React.ReactNode;
  className?: string;
};

export default function Widget({
  col,
  row,
  colSpan,
  rowSpan,
  className = undefined,
  children,
}: WidgetProps) {
  const instanceId = useContext(WidgetInstanceIdContext);

  const containerRef = useRef<HTMLDivElement>(null);
  const [bgRect, setBgRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const childEls = Array.from(containerRef.current.children).filter(
      (el) => !el.classList.contains(styles.widgetBackground)
    );
    if (childEls.length === 0) return;
    const rects = childEls.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left)) - containerRect.left;
    const top = Math.min(...rects.map((r) => r.top)) - containerRect.top;
    const right = Math.max(...rects.map((r) => r.right)) - containerRect.left;
    const bottom = Math.max(...rects.map((r) => r.bottom)) - containerRect.top;
    setBgRect({ left, top, width: right - left, height: bottom - top });
  }, [children]);

  const style: CSSProperties = {
    gridColumn: `${col} / span ${colSpan}`,
    gridRow: `${row} / span ${rowSpan}`,
    position: "relative",
  };

  return (
    <div
      ref={containerRef}
      className={combineClassNames(styles.widget, className)}
      style={style}
      data-widget-id={instanceId}
    >
      {bgRect && (
        <div
          className={styles.widgetBackground}
          style={{ position: "absolute", ...bgRect }}
        />
      )}
      {children}
    </div>
  );
}

function WidgetErrorWidget({
  error,
  resetErrorBoundary,
  ...placement
}: FallbackProps & WidgetPlacementProps) {
  return (
    <Widget {...placement}>
      <div className={styles.error}>{error.message}</div>
      <button onClick={resetErrorBoundary}>Reset Widget</button>
    </Widget>
  );
}

/**
 * Renders a single widget instance by ID. Subscribes only to that
 * instance via useSyncExternalStore — no other widget re-renders when
 * this instance's settings change.
 */
export function RenderWidget({
  instanceId,
  registry = canonicalRegistry,
}: {
  instanceId: string;
  registry?: InstanceRegistry;
}) {
  const widget = useWidgetInstance(instanceId, registry);
  if (!widget) return null;

  const placementProps = widgetPlacementToProps(widget.placement);
  const widgetDef = getWidgetDefinition(widget.definitionId);

  if (!widgetDef) {
    return (
      <WidgetInstanceIdContext.Provider value={instanceId}>
        <WidgetErrorWidget
          {...placementProps}
          error={
            new Error(
              `Error: No widget definition found for id "${widget.definitionId}"`,
            )
          }
          resetErrorBoundary={() => {}}
        />
      </WidgetInstanceIdContext.Provider>
    );
  }

  const WidgetComponent = widgetDef.component;
  return (
    <ErrorBoundary
      FallbackComponent={(props) => (
        <WidgetErrorWidget {...placementProps} {...props} />
      )}
    >
      <WidgetInstanceIdContext.Provider value={instanceId}>
        <WidgetComponent {...placementProps} {...widget.settings} />
      </WidgetInstanceIdContext.Provider>
    </ErrorBoundary>
  );
}

/**
 * Renders all registered widget instances. Re-renders only when the
 * instance list changes (add/remove) — not when individual settings change.
 */
export function Widgets() {
  const ids = useVisibleWidgetInstanceIds();
  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <div className={styles.error}>
          Error loading widgets: {error.message}
        </div>
      )}
    >
      {ids.map((id) => (
        <RenderWidget key={id} instanceId={id} />
      ))}
    </ErrorBoundary>
  );
}
