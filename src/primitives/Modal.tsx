import { createPortal } from "react-dom";
import styles from "./styles/Modal.module.css";

export function Modal({
  title,
  actions,
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return createPortal(
    <div className={styles.backdrop} onPointerDown={(e) => e.stopPropagation()}>
      <div className={styles.panel}>
        {title && <div className={styles.header}>{title}</div>}
        <div className={styles.body}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.getElementById("root")!,
  );
}
