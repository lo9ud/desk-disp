import type { CSSProperties } from "react";
import { indicatorColor } from "./color";
import type { IndicatorColor } from "./color";
import styles from "./styles/VBar.module.css";
import { combineClassNames } from "../utils/format";

interface VBarProps {
  value: number;
  max?: number;
  color?: IndicatorColor;
  /** Override track width, e.g. "16px". */
  width?: string;
  className?: string;
}

export function VBar({
  value,
  max = 100,
  color = "auto",
  width,
  className,
}: VBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const cssColor = indicatorColor(color, pct);

  return (
    <div
      className={combineClassNames(styles.track, className)}
      style={{ "--vbar-w": width } as CSSProperties}
    >
      <div
        className={styles.fill}
        style={{
          height: `${pct}%`,
          "--bar-color": cssColor,
        } as CSSProperties}
      />
    </div>
  );
}
