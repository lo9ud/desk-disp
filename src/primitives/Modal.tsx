import { createPortal } from "react-dom";
import styles from "./styles/Modal.module.css";

export function Modal({
  title,
  actions,
  onClose,
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  /** When given, clicking the backdrop dismisses the modal. Omit for modals
   *  that must be answered through their actions. */
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    // stopPropagation keeps clicks off whatever is behind the modal; the
    // target check means only a click on the backdrop itself dismisses, not
    // one that bubbled up from inside the panel.
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        {title && <div className={styles.header}>{title}</div>}
        <div className={styles.body}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.getElementById("root")!,
  );
}
