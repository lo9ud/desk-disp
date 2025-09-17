import { useHistory, useSmoothed, useStat } from "../hooks";
import { pointsToSmoothPath, range } from "../utils";

import styles from "./styles/PerfBox.module.css";
import { WidgetProps } from "./Widget";
import { useEffect, useRef, useState } from "react";

type UseStatArgs<T> = {
  getter: (...args: any[]) => Promise<T | null>;
  transform: (v: T | null) => Promise<number>;
  args: any[];
  refresh: number;
};

type PerfBoxProps<T> = Readonly<
  {
    title: string;
  } & WidgetProps &
    UseStatArgs<T>
>;

export default function PerfBox<T>({
  title,
  refresh,
  args = [],
  getter,
  transform,
  col,
  row,
  colSpan,
  rowSpan,
}: PerfBoxProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observer = useRef<ResizeObserver>(
    new ResizeObserver((entries) =>
      entries.forEach((entry) => setDim(entry.contentRect))
    )
  );
  const [dim, setDim] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (containerRef.current) {
      observer.current.observe(containerRef.current);
    }
    return () => {
      if (containerRef.current) {
        observer.current.unobserve(containerRef.current);
      }
    };
  }, []);

  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };

  return (
    <div className={styles.perfBox} style={style}>
      <div ref={containerRef} className={styles.graphContainer}>
        {containerRef.current && (
          <GraphSvg
            title={title}
            width={dim.width}
            height={dim.height}
            getter={getter}
            transform={transform}
            args={args}
            refresh={refresh}
          />
        )}
      </div>
    </div>
  );
}

function GraphSvg<T>({
  title,
  width,
  height,
  getter,
  transform,
  args,
  refresh,
}: { title: string; width: number; height: number } & UseStatArgs<T>) {
  return (
    <svg className={styles.svg} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4facfe17" />
          <stop offset="100%" stopColor="rgba(0, 39, 41, 0.07)" />
        </linearGradient>
      </defs>
      {/* y-lines */}
      {range(9).map((v) => (
        <line
          key={`y-line-${v}`}
          x1="0"
          y1={(v + 0.05) * height}
          x2={width}
          y2={(v + 0.05) * height}
          className={styles.gridLine}
        />
      ))}
      {/* x-lines */}
      {range(5).map((v) => (
        <line
          key={`x-line-${v}`}
          x1={(v + 0.1) * width}
          y1="0"
          x2={(v + 0.1) * width}
          y2={height}
          className={styles.gridLine}
        />
      ))}
      <text
        x={width / 2}
        y={height / 2}
        className={styles.axisLabel}
        textAnchor="middle"
      >
        {title}
      </text>
      {/* Smooth Path */}
      <Path
        width={width}
        height={height}
        getter={getter}
        transform={transform}
        args={args}
        refresh={refresh}
      />
    </svg>
  );
}

function Path<T>({
  width,
  height,
  getter,
  transform,
  args,
  refresh,
}: { width: number; height: number } & UseStatArgs<T>) {
  const historyLength = 25;
  const value = useStat<T, number>(getter, transform, args, refresh);
  const smoothed = useSmoothed(value);
  const history = useHistory(smoothed, historyLength);

  const points = history.map((v, i) => ({
    x: (i / (historyLength - 1)) * width + 1e-8,
    y: height - (v / 100) * height,
    t: (1000 / refresh) * i,
  }));

  const smoothPath = points.length > 3 ? pointsToSmoothPath(points) : "";

  const lastPoint = points[points.length - 1];

  const fillPath = points.length > 3 ?pointsToSmoothPath([
    { x: 0, y: height },
    ...points,
    { x: width, y: height },
  ]):"";

  return (
    <>
      <path d={fillPath} className={styles.underfill} />
      <path d={smoothPath} className={styles.line} />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={4} className={styles.dot} />
    </>
  );
}
