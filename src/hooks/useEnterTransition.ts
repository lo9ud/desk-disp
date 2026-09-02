import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "./useLatest";
import { useTimeout } from "./useTimeout";

export interface EnterTransition {
  /** Drive the CSS class or data attribute the transition keys off. */
  shown: boolean;
  /** Ends the exit early, from a transitionend the caller has vetted. */
  finishExit: () => void;
}

/**
 * Drives a CSS enter/exit transition. `shown` flips on a frame after `open`
 * does, since the closed state has to be committed first or the entry
 * transition never plays. On close, `onExited` fires once -- from
 * `finishExit`, or from `exitMs` as the fallback for a transitionend that
 * never arrives.
 */
export function useEnterTransition(
  open: boolean,
  exitMs: number,
  onExited?: () => void,
): EnterTransition {
  const [shown, setShown] = useState(false);
  const exited = useRef(false);
  const savedOnExited = useLatest(onExited);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    exited.current = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);

  const finishExit = useCallback(() => {
    if (exited.current) return;
    exited.current = true;
    savedOnExited.current?.();
  }, [savedOnExited]);

  useTimeout(finishExit, open ? null : exitMs);

  return { shown, finishExit };
}
