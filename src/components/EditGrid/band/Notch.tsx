import {
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/16/solid";
import { useState } from "react";
import { Button } from "../../../primitives/Button";
import { combineClassNames } from "../../../utils/format";
import type { InstanceRegistry } from "../../../registry/instanceRegistry";
import { WidgetError, widgetErrorText } from "../../../utils/widgetErrors";
import styles from "../styles/band.module.css";

export function Notch({
  errors,
  registry,
  hasBlockingErrors,
  saving,
  onSave,
  onCancel,
  gap,
  gapDisabled,
  onGapPointerDown,
  onGapPointerMove,
  onGapPointerUp,
}: {
  errors: WidgetError[];
  registry: InstanceRegistry | null;
  hasBlockingErrors: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  gap: number;
  gapDisabled: boolean;
  onGapPointerDown: (e: React.PointerEvent) => void;
  onGapPointerMove: (e: React.PointerEvent) => void;
  onGapPointerUp: () => void;
}) {
  const [gapOpen, setGapOpen] = useState(false);

  return (
    <div className={styles.notch} onPointerDown={(e) => e.stopPropagation()}>
      <Button
        variant="accent"
        disabled={hasBlockingErrors || saving}
        onClick={onSave}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {errors.length > 0 && (
        <span
          className={combineClassNames(
            styles.notchBadge,
            hasBlockingErrors ? styles.error : styles.warning,
          )}
          title={errors
            .map((e) => widgetErrorText(e, registry).message)
            .join("\n")}
        >
          {errors.length} {hasBlockingErrors ? "error" : "warning"}
          {errors.length > 1 ? "s" : ""}
        </span>
      )}
      <div
        className={combineClassNames(
          styles.gapControl,
          gapOpen ? styles.gapControlOpen : styles.gapControlClosed,
        )}
      >
        <span>Gap:</span>
        <div
          className={combineClassNames(
            styles.gapScrubber,
            gapDisabled ? styles.gapScrubberDisabled : undefined,
          )}
          title={gapDisabled ? "Unavailable while adding widgets" : undefined}
          onPointerDown={gapDisabled ? undefined : onGapPointerDown}
          onPointerMove={gapDisabled ? undefined : onGapPointerMove}
          onPointerUp={gapDisabled ? undefined : onGapPointerUp}
        >
          <ArrowLongLeftIcon /> {gap}px <ArrowLongRightIcon />
        </div>
      </div>
      <Button
        variant="icon"
        onClick={() => setGapOpen((v) => !v)}
        title={gapOpen ? "Hide gap control" : "Adjust grid gap"}
      >
        {gapOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </Button>
    </div>
  );
}
