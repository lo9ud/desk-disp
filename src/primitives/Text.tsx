import styles from "./styles/Text.module.css";
import { combineClassNames } from "../utils/format";

type TextVariant = "default" | "muted" | "subtle" | "code";

const variantClass: Record<TextVariant, string | undefined> = {
  default: undefined,
  muted: styles.muted,
  subtle: styles.subtle,
  code: styles.code,
};

export function Text({
  variant = "default",
  as: Tag = "p",
  className,
  children,
  ...props
}: {
  variant?: TextVariant;
  as?: React.ElementType;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={combineClassNames(
        styles.text,
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
