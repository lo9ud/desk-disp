import styles from "./styles/Panel.module.css";
import { combineClassNames } from "../utils/format";

export function Panel({
  padding = "md",
  className,
  children,
  ...props
}: {
  padding?: "sm" | "md";
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={combineClassNames(
        styles.panel,
        padding === "sm" ? styles.sm : styles.md,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
