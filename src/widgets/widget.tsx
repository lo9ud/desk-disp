import {
  CSSProperties,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { widgetPlacementToProps } from "../utils/config";
import styles from "./styles/widget.module.css";
import { getWidgetEntry } from "../registry/defRegistry";
import {
  InstanceRegistry,
  useWidgetInstance,
  useWidgetInstanceIds,
} from "../registry/instanceRegistry";
import { combineClassNames } from "../utils/format";
import { ErrorBoundary } from "react-error-boundary";
import { useDevMode } from "../context/DevModeContext";
import WidgetError from "../components/WidgetError";
import {
  useRuntime,
  useWidgetApi,
  WidgetApiProvider,
} from "../runtime/context";

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
  const devMode = useDevMode();
  const { instanceId } = useWidgetApi();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const [boundingInnerRect, setBoundingInnerRect] = useState<DOMRect | null>(null);

  const measuring =
    devMode.active &&
    (devMode.toolboxSettings.showMissingBackground ||
      devMode.toolboxSettings.displayWidgetUsedSpace);

  const measure = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    setContainerRect(rect);

    const childEls = Array.from(containerRef.current.children).filter(
      (el) => !el.classList.contains(styles.widgetBackground),
    );

    if (childEls.length === 0) return;
    const rects = childEls.map((el) => el.getBoundingClientRect());

    const left = Math.min(...rects.map((r) => r.left)) - rect.left;
    const top = Math.min(...rects.map((r) => r.top)) - rect.top;
    const right = Math.max(...rects.map((r) => r.right)) - rect.left;
    const bottom = Math.max(...rects.map((r) => r.bottom)) - rect.top;

    setBoundingInnerRect(new DOMRect(left, top, right - left, bottom - top));
  }, []);

  useLayoutEffect(() => {
    if (!measuring || !containerRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure, measuring]);

  useLayoutEffect(() => {
    if (measuring) measure();
  }, [measure, measuring, children]);

  const style: CSSProperties = {
    gridColumn: `${col} / span ${colSpan}`,
    gridRow: `${row} / span ${rowSpan}`,
    position: "relative",
  };

  const devStyles = devMode.active
    ? [devMode.toolboxSettings.displayWidgetCells && styles.widgetDevCells]
    : [];

  const overlayStyle: CSSProperties | undefined =
    boundingInnerRect && containerRect
      ? {
          position: "fixed",
          left: containerRect.left + boundingInnerRect.left,
          top: containerRect.top + boundingInnerRect.top,
          width: boundingInnerRect.width,
          height: boundingInnerRect.height,
        }
      : undefined;

  return (
    <>
      {measuring &&
        devMode.toolboxSettings.showMissingBackground &&
        overlayStyle && (
          <div
            className={styles.widgetDevMissingBackground}
            style={overlayStyle}
          />
        )}
      <div
        ref={containerRef}
        className={combineClassNames(styles.widget, className, ...devStyles)}
        style={style}
        data-widget-id={instanceId}
      >
        {children}
      </div>
      {measuring &&
        devMode.toolboxSettings.displayWidgetUsedSpace &&
        overlayStyle && (
          <div className={styles.widgetDevUsedSpace} style={overlayStyle} />
        )}
    </>
  );
}

/**
 * Renders a single widget instance by ID.
 */
export function RenderWidget({
  instanceId,
  registry,
}: {
  instanceId: string;
  /** Defaults to the runtime's registry; edit-mode drafts and gallery
   *  cards pass their own throwaway one. */
  registry?: InstanceRegistry;
}) {
  const runtime = useRuntime();
  const reg = registry ?? runtime.instances;
  const widget = useWidgetInstance(instanceId, reg);
  const definitionId = widget?.definitionId ?? "";

  const api = useMemo(
    () => runtime.forWidget(instanceId, definitionId),
    [runtime, instanceId, definitionId],
  );

  if (!widget) return null;

  const placementProps = widgetPlacementToProps(widget.placement);
  const entry = getWidgetEntry(widget.definitionId);

  if (!entry) {
    return (
      <WidgetApiProvider api={api}>
        <Widget {...placementProps}>
          <WidgetError
            error={
              new Error(
                `Error: No widget definition found for id "${widget.definitionId}"`,
              )
            }
            resetErrorBoundary={() => {}}
            instanceId={instanceId}
            widgetDef={undefined}
          />
        </Widget>
      </WidgetApiProvider>
    );
  }

  const WidgetComponent = entry.component;
  return (
    <WidgetApiProvider api={api}>
      <WidgetComponent {...placementProps} settings={widget.settings} />
    </WidgetApiProvider>
  );
}

/**
 * Renders all registered widget instances.
 */
export function Widgets() {
  const runtime = useRuntime();
  const ids = useWidgetInstanceIds(runtime.instances);
  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <div className={styles.error}>
          Error loading widgets:{" "}
          {typeof error === "object" && error !== null
            ? ((error as Error).message ?? JSON.stringify(error))
            : String(error)}
        </div>
      )}
      onReset={runtime.persistence.retryAfterReset}
    >
      {ids.map((id) => (
        <RenderWidget key={id} instanceId={id} />
      ))}
    </ErrorBoundary>
  );
}
