import { Button, ButtonVariant } from "../../primitives/Button";
import { combineClassNames } from "../../utils/format";
import styles from "./styles/InputGroup.module.css";

export default function InputGroup({
  label,
  preview,
  headerButtons,
  children,
}: {
  label: string;
  preview?: React.ReactNode;
  headerButtons?: {
    label: React.ReactNode;
    variant: ButtonVariant;
    onClick: () => void;
  }[];
  children: React.ReactNode;
}) {
  const hasPreview = !!preview;
  return (
    <div className={combineClassNames(styles.group, hasPreview && styles.groupWithPreview)}>
      <div className={styles.groupHeader}>
        <span className={styles.groupTitle}>{label}</span>
          {headerButtons?.map(({ label, variant, onClick }, i) => (
            <Button key={i} variant={variant} onClick={onClick}>
              {label}
            </Button>
          ))}
        <hr className={styles.divider} />
      </div>
      <div className={styles.groupContent}>{children}</div>
      {hasPreview && <div className={styles.groupPreview}>{preview}</div>}
    </div>
  );
}
