import { Button } from "../../../primitives/Button";
import styles from "../styles/band.module.css";

/**
 * Sits at the top-right of the band, the same side as the rail it opens.
 * Hidden while the rail is open — the rail covers this corner and closes
 * itself from its own header.
 */
export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <div className={styles.addButton} onPointerDown={(e) => e.stopPropagation()}>
      <Button variant="default" onClick={onClick}>
        Add Widget
      </Button>
    </div>
  );
}
