import {
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/16/solid";
import { Button } from "../../primitives/Button";
import { combineClassNames } from "../../utils/format";
import styles from "./styles/grid.module.css";

export function EditBar({
  errorCount,
  hasBlockingErrors,
  cancel,
  saving,
  handleSaveClick,
  gap,
  onGapPointerDown,
  onGapPointerMove,
  onGapPointerUp,
  gapOpen,
  onToggleGapOpen,
}: {
  errorCount: number;
  hasBlockingErrors: boolean;
  cancel: () => void;
  saving: boolean;
  handleSaveClick: () => void;
  gap: number;
  onGapPointerDown: (e: React.PointerEvent) => void;
  onGapPointerMove: (e: React.PointerEvent) => void;
  onGapPointerUp: () => void;
  gapOpen: boolean;
  onToggleGapOpen: () => void;
}) {
  return (
    <div className={styles.editBar}>
      {errorCount > 0 && (
        <span
          className={hasBlockingErrors ? styles.errorBadge : styles.warningBadge}
        >
          {errorCount} {hasBlockingErrors ? "error" : "warning"}
          {errorCount > 1 ? "s" : ""}
        </span>
      )}
      <Button variant="ghost" onClick={cancel} keybind={[["escape"], cancel]}>
        Cancel
      </Button>
      <Button
        variant="accent"
        disabled={hasBlockingErrors || saving}
        onClick={handleSaveClick}
        keybind={[["enter"], handleSaveClick]}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      <div
        className={combineClassNames(
          styles.gapControl,
          gapOpen ? styles.gapControlOpen : styles.gapControlClosed,
        )}
      >
        <span>Gap:</span>
        <div
          className={styles.gapScrubber}
          onPointerDown={onGapPointerDown}
          onPointerMove={onGapPointerMove}
          onPointerUp={onGapPointerUp}
        >
          <ArrowLongLeftIcon /> {gap}px <ArrowLongRightIcon />
        </div>
      </div>
      <Button onClick={onToggleGapOpen} title="More settings">
        {gapOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </Button>
    </div>
  );
}
