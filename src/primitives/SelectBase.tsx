import styles from "./styles/SelectBase.module.css";
import { combineClassNames } from "../utils/format";

export function SelectBase({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={combineClassNames(styles.select, className)}
      {...props}
    >
      {children}
    </select>
  );
}
