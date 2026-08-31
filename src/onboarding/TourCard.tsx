import { XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../primitives/Button";
import { combineClassNames } from "../utils/format";
import { placePanel, type Side } from "../utils/placement";
import { type Box, viewportBox } from "./geometry";
import styles from "./styles/tour.module.css";

const ARROW_PAD = 14;
const CORNER_MARGIN = 16;

const ARROW_CLASS: Record<Side, string> = {
  below: styles.arrow_below,
  above: styles.arrow_above,
  right: styles.arrow_right,
  left: styles.arrow_left,
};

interface Position {
  x: number;
  y: number;
  side: Side | null;
  /** Offset of the arrow along the card edge it sits on. */
  arrow: number | null;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

export function TourCard({
  anchor,
  icon,
  title,
  body,
  instruction,
  hint,
  dots,
  onNext,
  nextLabel,
  onBack,
  onSkip,
  skipLabel,
  onClose,
  prefer,
  corner,
  shakeKey = 0,
}: {
  /** Null centres the card and drops the arrow. */
  anchor: Box | null;
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Required action; replaces the Next button, since the step advances on the
   *  action rather than on a click here. */
  instruction?: string;
  /** Optional nudge. Coexists with the Next button. */
  hint?: string;
  dots?: { index: number; count: number };
  onNext: () => void;
  nextLabel: string;
  onBack?: () => void;
  /** Inline decline button, for a choice being offered rather than a dismissal. */
  onSkip?: () => void;
  skipLabel?: string;
  /** Leaves the whole tour. Rendered as card chrome, away from step navigation,
   *  so its scope doesn't read as "skip this step". */
  onClose?: () => void;
  prefer?: Side;
  /** Parks the card in the top-right instead of centring it, for an offer that
   *  shouldn't take over the screen. */
  corner?: boolean;
  /** Bumped to replay the shake; the card is the only feedback on an invite,
   *  which has no rings to shake. */
  shakeKey?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    const bounds = viewportBox();

    if (corner) {
      setPos({
        x: Math.round(bounds.w - size.w - CORNER_MARGIN),
        y: Math.round(CORNER_MARGIN),
        side: null,
        arrow: null,
      });
      return;
    }

    if (!anchor) {
      setPos({
        x: Math.round((bounds.w - size.w) / 2),
        y: Math.round((bounds.h - size.h) / 2),
        side: null,
        arrow: null,
      });
      return;
    }

    const { rect, side } = placePanel(anchor, size, bounds, prefer);

    // The arrow is absolutely positioned, so its origin is the card's padding
    // box - inset from rect by the border. Measure it rather than assuming.
    const originX = rect.x + el.clientLeft;
    const originY = rect.y + el.clientTop;
    let arrow: number | null = null;
    if (side === "below" || side === "above") {
      arrow = clamp(
        anchor.x + anchor.w / 2 - originX,
        ARROW_PAD,
        el.clientWidth - ARROW_PAD,
      );
    } else if (side) {
      arrow = clamp(
        anchor.y + anchor.h / 2 - originY,
        ARROW_PAD,
        el.clientHeight - ARROW_PAD,
      );
    }
    setPos({ x: Math.round(rect.x), y: Math.round(rect.y), side, arrow });
  }, [anchor, title, body, hint, instruction, prefer, corner]);

  // Restarting a CSS animation needs the class removed, a reflow, then re-added.
  // Remounting would work too, but would throw away the measured position.
  useEffect(() => {
    const el = ref.current;
    if (!el || shakeKey === 0) return;
    el.classList.remove(styles.shake);
    void el.offsetWidth;
    el.classList.add(styles.shake);
  }, [shakeKey]);

  const horizontal = pos?.side === "left" || pos?.side === "right";

  return (
    <div
      ref={ref}
      className={styles.card}
      style={pos ? { top: pos.y, left: pos.x } : { visibility: "hidden" }}
    >
      {pos?.side && pos.arrow !== null && (
        <div
          className={combineClassNames(styles.arrow, ARROW_CLASS[pos.side])}
          style={horizontal ? { top: pos.arrow } : { left: pos.arrow }}
        />
      )}
      {onClose && (
        <Button
          variant="icon_ghost"
          className={styles.close}
          title="Exit tour"
          aria-label="Exit tour"
          onClick={onClose}
        >
          <XMarkIcon />
        </Button>
      )}
      <div className={styles.icon}>{icon}</div>
      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        <div className={styles.body}>{body}</div>
        {hint && <div className={styles.hint}>{hint}</div>}
        {instruction && <div className={styles.instruction}>{instruction}</div>}
      </div>
      <div className={styles.footer}>
        {dots && (
          <div className={styles.dots}>
            {Array.from({ length: dots.count }, (_, i) => (
              <span
                key={i}
                className={i === dots.index ? styles.dot_active : styles.dot}
              />
            ))}
          </div>
        )}
        <div className={styles.actions}>
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              {skipLabel ?? "Skip"}
            </Button>
          )}
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          )}
          {!instruction && (
            <Button variant="accent" onClick={onNext}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
