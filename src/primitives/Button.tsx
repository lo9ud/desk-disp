import styles from "./styles/Button.module.css";
import { combineClassNames } from "../utils/format";

type ButtonSize = "sm" | "md";

const variantClass = {
  default: undefined,
  ghost: styles.ghost,
  ghost_danger: styles.ghost_danger,
  accent: styles.accent,
  danger: styles.danger,
  warning: styles.warning,
};
export type ButtonVariant = keyof typeof variantClass;

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={combineClassNames(
        styles.button,
        variantClass[variant],
        size === "sm" ? styles.sm : undefined,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
