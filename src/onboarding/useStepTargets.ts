import { useEffect, useState } from "react";
import {
  type Box,
  boxKey,
  clippingAncestors,
  ensureVisible,
  resolveTargets,
  visibleBox,
} from "./geometry";
import type { Step, TourCtx } from "./types";

/** How long to wait for a step's elements before giving up on it. Covers the
 *  rail's slide-in and the deferred settings-panel open. */
const RESOLVE_TIMEOUT_MS = 1500;

export type TargetStatus = "pending" | "resolved" | "none" | "unresolved";

export interface StepTargets {
  status: TargetStatus;
  els: HTMLElement[];
  boxes: Box[];
}

const EMPTY: StepTargets = { status: "pending", els: [], boxes: [] };

const NONE: StepTargets = { status: "none", els: [], boxes: [] };

/**
 * Resolves a step's elements and keeps their boxes current. Measurement is
 * continuous rather than event-driven: the band inset, the add-mode stage
 * transform, the rail slide and a font-scale change all move targets with no
 * single signal to listen for. State is only written when a box actually moves,
 * so a settled step costs no renders.
 */
export function useStepTargets(
  step: Step | null,
  ctx: TourCtx,
  active: boolean,
): StepTargets {
  // Tagged with the step it was measured from, so the previous step's boxes
  // can't be read as this one's in the frame before the first tick lands.
  const [measured, setMeasured] = useState<{
    step: Step;
    targets: StepTargets;
  } | null>(null);

  useEffect(() => {
    if (!active || !step?.targets) return;

    let raf = 0;
    let els: HTMLElement[] = [];
    let clippers: Element[][] = [];
    let scrolled = false;
    let lastKey = "";
    // Measured from the last sighting, not from step entry: a target can vanish
    // mid-step (a click deselects the widget its handles belong to) and be put
    // back by the reconciler, which shouldn't count against the step.
    let lastSeen = performance.now();

    const tick = () => {
      // Re-resolve when empty, and when a node has been detached by a re-render:
      // a detached element measures as zero and would otherwise look unreachable.
      if (els.length === 0 || els.some((el) => !el.isConnected)) {
        els = resolveTargets(step.targets!, ctx);
        clippers = els.map(clippingAncestors);
      }

      const boxes = els
        .map((el, i) => visibleBox(el, clippers[i]))
        .filter((b): b is Box => b !== null);

      if (boxes.length > 0) {
        lastSeen = performance.now();
        if (!scrolled) {
          scrolled = true;
          els.forEach((el, i) => ensureVisible(el, clippers[i]));
        }
        const key = boxKey(boxes);
        if (key !== lastKey) {
          lastKey = key;
          setMeasured({ step, targets: { status: "resolved", els, boxes } });
        }
      } else if (performance.now() - lastSeen > RESOLVE_TIMEOUT_MS) {
        // Present but clipped to nothing, or never rendered at all. Either way
        // a ring would point at empty space, so the step is dropped instead.
        setMeasured({
          step,
          targets: { status: "unresolved", els: [], boxes: [] },
        });
        return;
      } else if (els.length > 0 && !scrolled) {
        scrolled = true;
        els.forEach((el, i) => ensureVisible(el, clippers[i]));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, ctx, active]);

  if (!active || !step) return EMPTY;
  if (!step.targets) return NONE;
  return measured?.step === step ? measured.targets : EMPTY;
}
