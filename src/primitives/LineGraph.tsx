import type { CSSProperties } from "react";
import styles from "./styles/LineGraph.module.css";
import { combineClassNames } from "../utils/format";

interface LineGraphProps {
  values: readonly number[];
  /** Explicit max. Defaults to the observed maximum across values. */
  max?: number;
  /** Explicit min. Defaults to 0. */
  min?: number;
  /** CSS color for the line and fill. Defaults to a fixed blue-teal. */
  color?: string;
  /** Render filled area under the line. */
  filled?: boolean;
  /** Use smooth cubic-bezier curves instead of straight segments. */
  smooth?: boolean;
  /** Override SVG height, e.g. "50px". */
  height?: string;
  className?: string;
}

function buildPath(
  pts: { x: number; y: number }[],
  smooth: boolean
): string {
  if (pts.length < 2) return "";
  if (!smooth) {
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
  }
  // Cubic bezier: control points are the midpoint x between neighbours,
  // preserving each point's y — gives smooth monotone-ish curves.
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = ((prev.x + curr.x) / 2).toFixed(2);
    d += ` C ${cpx} ${prev.y.toFixed(2)} ${cpx} ${curr.y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }
  return d;
}

const DEFAULT_COLOR = "hsl(200, 65%, 55%)";
const W = 100;
const H = 40;

export function LineGraph({
  values,
  max,
  min = 0,
  color = DEFAULT_COLOR,
  filled = true,
  smooth = true,
  height,
  className,
}: LineGraphProps) {
  const style = { "--graph-color": color, "--graph-h": height } as CSSProperties;

  if (values.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={combineClassNames(styles.graph, className)}
        style={style}
      />
    );
  }

  const dataMax = max ?? Math.max(...values);
  const range = Math.max(dataMax - min, 1e-6);

  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));

  const linePath = buildPath(pts, smooth);
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={combineClassNames(styles.graph, className)}
      style={style}
    >
      {filled && <path d={areaPath} className={styles.area} />}
      <path d={linePath} className={styles.line} />
    </svg>
  );
}
