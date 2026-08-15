import { Button } from "../../primitives/Button";
import { Modal } from "../../primitives/Modal";
import { WidgetError, widgetErrorText } from "../../utils/widgetErrors";
import styles from "./styles/grid.module.css";

export function ConfirmSaveModal({
  errors,
  onCancel,
  onConfirm,
}: {
  errors: WidgetError[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Save with warnings?"
      // Clicking away backs out of the save rather than committing it.
      onClose={onCancel}
      actions={[
        <Button key="cancel" variant="ghost_danger" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="save" variant="default" onClick={onConfirm}>
          Save anyway
        </Button>,
      ]}
    >
      <ul className={styles.errorList}>
        {errors.map((e) => (
          <li key={`${e.kind}-${e.widgetIds.join(",")}`}>
            {widgetErrorText(e).message}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
