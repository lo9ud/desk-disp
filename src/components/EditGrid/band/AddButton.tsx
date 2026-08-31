import { Button } from "../../../primitives/Button";
import styles from "../styles/band.module.css";

export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <div
      className={styles.addButton}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button data-onboarding="add-widget" variant="default" onClick={onClick}>
        Add Widget
      </Button>
    </div>
  );
}
