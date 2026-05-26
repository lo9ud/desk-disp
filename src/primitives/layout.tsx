import type { CSSProperties, ReactNode } from "react";
import styles from "./styles/layout.module.css";
import { combineClassNames } from "../utils/format";

interface LayoutProps {
  children: ReactNode;
  gap?: string;
  align?: string;
  justify?: string;
  className?: string;
  style?: CSSProperties;
}

export function Row({
  children,
  gap,
  align,
  justify,
  className,
  style,
}: LayoutProps) {
  return (
    <div
      className={combineClassNames(styles.row, className)}
      style={{ "--gap": gap, "--align": align, "--justify": justify, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function Stack({
  children,
  gap,
  align,
  justify,
  className,
  style,
}: LayoutProps) {
  return (
    <div
      className={combineClassNames(styles.stack, className)}
      style={{ "--gap": gap, "--align": align, "--justify": justify, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
