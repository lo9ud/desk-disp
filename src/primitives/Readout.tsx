import type { ReactNode } from "react";
import styles from "./styles/Readout.module.css";
import { combineClassNames } from "../utils/format";

interface ReadoutProps {
  /** Left side of the header row. */
  title?: ReactNode;
  /** Right side of the header row — typically a formatted current value. */
  value?: ReactNode;
  /** Small text rendered below the visual. */
  subtitle?: ReactNode;
  /** The visual — Bar, VBar, LineGraph, PieChart, or any composition. */
  children?: ReactNode;
  className?: string;
}

export function Readout({
  title,
  value,
  subtitle,
  children,
  className,
}: ReadoutProps) {
  return (
    <div className={combineClassNames(styles.readout, className)}>
      {(title != null || value != null) && (
        <div className={styles.header}>
          {title != null && <span className={styles.title}>{title}</span>}
          {value != null && <span className={styles.value}>{value}</span>}
        </div>
      )}
      {children}
      {/* {subtitle != null && ( */}
        <div className={styles.subtitle}>{subtitle || null}</div>
      {/* )} */}
    </div>
  );
}
