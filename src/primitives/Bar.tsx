import type { CSSProperties } from "react";
import { indicatorColor, indicatorColorStart } from "./color";
import type { IndicatorColor } from "./color";
import styles from "./styles/Bar.module.css";
import { combineClassNames } from "../utils/format";

export type BarStyle = "solid" | "gradient" | "blocks" | "blocks-fade";

interface BarProps {
  value: number;
  max?: number;
  barStyle?: BarStyle;
  color?: IndicatorColor;
  /** Number of segments for blocks/blocks-fade variants. */
  blocks?: number;
  /** Override track height, e.g. "10px". */
  height?: string;
  className?: string;
}

export function Bar({
  value,
  max = 100,
  barStyle = "solid",
  color = "auto",
  blocks = 20,
  height,
  className,
}: BarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const cssColor = indicatorColor(color, pct);

  if (barStyle === "blocks" || barStyle === "blocks-fade") {
    const filled = Math.floor((pct / 100) * blocks);
    const partial = (pct / 100) * blocks - filled;

    return (
      <div
        className={combineClassNames(styles.blocks, className)}
        style={{ "--bar-h": height, "--bar-color": cssColor } as CSSProperties}
      >
        {Array.from({ length: blocks }, (_, i) => {
          let opacity: number;
          if (i < filled) opacity = 1;
          else if (i === filled && barStyle === "blocks-fade") opacity = Math.max(partial, 0.08);
          else opacity = 0.08;
          return <div key={i} className={styles.block} style={{ opacity }} />;
        })}
      </div>
    );
  }

  return (
    <div
      className={combineClassNames(styles.track, className)}
      style={{ "--bar-h": height } as CSSProperties}
    >
      <div
        className={styles.fill}
        data-style={barStyle}
        style={{
          width: `${pct}%`,
          "--bar-color": cssColor,
          "--bar-color-start":
            barStyle === "gradient" ? indicatorColorStart(color) : undefined,
        } as CSSProperties}
      />
    </div>
  );
}
