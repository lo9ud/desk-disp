import type { CSSProperties } from "react";
import { indicatorColor } from "./color";
import type { IndicatorColor } from "./color";
import styles from "./styles/PieChart.module.css";
import { combineClassNames } from "../utils/format";

interface PieChartProps {
  value: number;
  max?: number;
  color?: IndicatorColor;
  /** Override diameter, e.g. "80px". */
  size?: string;
  /** Stroke width of the ring. */
  thickness?: number;
  /** Render percentage text in the centre. */
  label?: boolean;
  className?: string;
}

// r chosen so that circumference ≈ 100, making stroke-dasharray values
// directly equal to percentages.
const R = 15.9155;
const CX = 18;
const CY = 18;

export function PieChart({
  value,
  max = 100,
  color = "auto",
  size,
  thickness = 4,
  label = false,
  className,
}: PieChartProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const cssColor = indicatorColor(color, pct);

  return (
    <svg
      viewBox="0 0 36 36"
      className={combineClassNames(styles.pie, className)}
      style={{
        "--pie-size": size,
        "--pie-color": cssColor,
        "--pie-thickness": thickness,
      } as CSSProperties}
    >
      <circle cx={CX} cy={CY} r={R} className={styles.track} />
      <circle
        cx={CX}
        cy={CY}
        r={R}
        className={styles.fill}
        // strokeDashoffset of 25 = circumference/4, starts arc at 12 o'clock
        strokeDasharray={`${pct} ${100 - pct}`}
        strokeDashoffset="25"
        // transform={`rotate(-90 ${CX} ${CY})`}
      />
      {label && (
        <text x={CX} y={CY + 0.5} className={styles.label}>
          {Math.round(pct)}%
        </text>
      )}
    </svg>
  );
}
