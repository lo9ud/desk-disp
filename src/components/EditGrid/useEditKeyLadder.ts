import { useEffect, useRef } from "react";

export interface KeyLadderState {
  /** Ignore all keys (e.g. while the exit animation is running). */
  suspended: boolean;
  /** A tour chapter is running and owns the keyboard. It sits outside this
   *  ladder entirely: Esc leaves the tour, and its teardown restores whatever
   *  edit state the chapter had put in place. */
  tourActive: boolean;
  confirmSaveOpen: boolean;
  closeConfirmSave: () => void;
  confirmCancelOpen: boolean;
  closeConfirmCancel: () => void;
  addOpen: boolean;
  closeAdd: () => void;
  settingsOpen: boolean;
  closeSettings: () => void;
  hasSelection: boolean;
  deselect: () => void;
  /** Dirty-aware cancel (may open the confirm modal). */
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable)
  );
}

/**
 * Single keyboard entry point for edit mode. Esc unwinds the innermost open
 * context first; Enter saves only when nothing narrower is active.
 */
export function useEditKeyLadder(state: KeyLadderState) {
  // Handlers close over fresh state via a ref so the window listener is
  // attached exactly once.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.suspended || s.tourActive || isTextTarget(e.target)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (s.confirmSaveOpen) s.closeConfirmSave();
        else if (s.confirmCancelOpen) s.closeConfirmCancel();
        else if (s.addOpen) s.closeAdd();
        else if (s.settingsOpen) s.closeSettings();
        else if (s.hasSelection) s.deselect();
        else s.onCancel();
      } else if (e.key === "Enter") {
        if (
          s.confirmSaveOpen ||
          s.confirmCancelOpen ||
          s.addOpen ||
          s.settingsOpen ||
          s.hasSelection ||
          s.saving
        ) {
          return;
        }
        e.preventDefault();
        s.onSave();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, []);
}
