import { Button } from "../../primitives/Button";
import { Modal } from "../../primitives/Modal";

export function ConfirmCancelModal({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <Modal
      title="Discard changes?"
      // Clicking away is the cautious answer: keep editing, discard nothing.
      onClose={onKeepEditing}
      actions={[
        <Button key="keep" variant="ghost" onClick={onKeepEditing}>
          Keep editing
        </Button>,
        <Button key="discard" variant="danger" onClick={onDiscard}>
          Discard
        </Button>,
      ]}
    >
      <p>Your unsaved layout changes will be lost.</p>
    </Modal>
  );
}
