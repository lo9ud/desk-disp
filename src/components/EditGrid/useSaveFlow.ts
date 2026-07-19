import { useState } from "react";
import { logger } from "../../utils/logger";

const { error } = logger("edit-grid");

export function useSaveFlow(
  save: () => Promise<void>,
  hasBlockingErrors: boolean,
  hasWarnings: boolean,
) {
  const [saving, setSaving] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  async function performSave() {
    setConfirmSaveOpen(false);
    setSaving(true);
    try {
      await save();
    } catch (err) {
      error("Save failed:", err?.toString());
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (hasBlockingErrors) return;
    if (hasWarnings) {
      setConfirmSaveOpen(true);
      return;
    }
    performSave();
  }

  function closeConfirm() {
    setConfirmSaveOpen(false);
  }

  return { saving, confirmSaveOpen, handleSaveClick, performSave, closeConfirm };
}
