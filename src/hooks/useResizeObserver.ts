import { useEffect, useState } from "react";
import { useLatest } from "./useLatest";

/**
 * Observes whichever element the returned ref is attached to. It hands back a
 * ref callback rather than taking a ref object so the observer follows an
 * element that is swapped or remounted under a component that stays mounted,
 * which a one-shot effect over a ref object would miss.
 */
export function useResizeObserver<T extends Element>(
  onResize: (el: T) => void,
  enabled = true,
): (el: T | null) => void {
  const saved = useLatest(onResize);
  const [el, setEl] = useState<T | null>(null);

  useEffect(() => {
    if (!el || !enabled) return;
    const observer = new ResizeObserver(() => saved.current(el));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, enabled, saved]);

  return setEl;
}
