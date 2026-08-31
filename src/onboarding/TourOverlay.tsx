import { useMemo } from "react";
import { combineClassNames } from "../utils/format";
import {
  type Box,
  cutoutPath,
  inflate,
  mergeOverlapping,
  union,
} from "./geometry";
import styles from "./styles/tour.module.css";
import type { RenderStyle } from "./types";

const HOLE_PAD = 4;

export function TourOverlay({
  boxes,
  marks = [],
  render,
  shakeKey,
  onScrimClick,
}: {
  boxes: Box[];
  /** Ringed without being cut out, so they stay under the scrim and inert. */
  marks?: Box[];
  render?: RenderStyle;
  /** Bumped on a rejected click; remounting replays the shake. */
  shakeKey: number;
  onScrimClick: () => void;
}) {
  const maskMode = render?.mask ?? "individual";
  const ringMode = render?.ring ?? "individual";

  const holePad = render?.holePad ?? HOLE_PAD;

  const holes = useMemo(() => {
    // Marks are cut out too: they are meant to be seen, and being unclickable is
    // enforced by the tour's own capture-phase blocker rather than by leaving
    // them under the scrim.
    const cut = [
      ...boxes.map((b) => inflate(b, holePad)),
      ...marks.map((b) => inflate(b, HOLE_PAD)),
      // A hole inset past the target's own size collapses; drop it rather than
      // letting it invert, which leaves the target simply uncovered.
    ].filter((b) => b.w > 0 && b.h > 0);
    if (cut.length === 0) return [];
    const merged = union(cut);
    return maskMode === "unified" && merged ? [merged] : mergeOverlapping(cut);
  }, [boxes, marks, holePad, maskMode]);

  const rings = useMemo(() => {
    const padded = boxes.map((b) => inflate(b, HOLE_PAD));
    if (padded.length === 0) return [];
    const merged = union(padded);
    return ringMode === "unified" && merged ? [merged] : padded;
  }, [boxes, ringMode]);

  return (
    <>
      <div
        className={styles.scrim}
        style={
          holes.length > 0
            ? { clipPath: `path(evenodd, "${cutoutPath(holes)}")` }
            : undefined
        }
        onClick={onScrimClick}
      />
      <div
        key={shakeKey}
        className={combineClassNames(
          styles.rings,
          shakeKey > 0 ? styles.shake : undefined,
        )}
      >
        {rings.map((b) => (
          <div
            key={`${b.x},${b.y},${b.w},${b.h}`}
            className={styles.ring}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          />
        ))}
        {marks.map((b) => (
          <div
            key={`mark:${b.x},${b.y},${b.w},${b.h}`}
            className={combineClassNames(styles.ring, styles.markRing)}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          />
        ))}
      </div>
    </>
  );
}
