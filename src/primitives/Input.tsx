import styles from "./styles/Input.module.css";
import { combineClassNames } from "../utils/format";

export function Input({
  mono,
  className,
  ...props
}: { mono?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={combineClassNames(
        styles.input,
        mono ? styles.mono : undefined,
        className,
      )}
      {...props}
    />
  );
}
