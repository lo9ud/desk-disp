import styles from "./styles/Button.module.css";
import { combineClassNames } from "../utils/format";
import { useEffect } from "react";

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

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  keybind?: [string, () => void];
};

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
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
      {/* {keybind && <KeyIcons keys={keybind[0]} />} */}
    </button>
  );
}

function KeyIcons({ keys }: { keys: string }) {
  return (
    <kbd>
      {keys
        .split("+")
        .flatMap((k) => [<kbd key={k}>{k}</kbd>, <>+</>])
        .slice(0, -1)}
    </kbd>
  );
}
