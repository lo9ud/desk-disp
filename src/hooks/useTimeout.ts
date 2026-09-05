import { useEffect } from "react";
import { useLatest } from "./useLatest";

/**
 * Calls `callback` once, `delay` ms after `delay` was last set, or not at all
 * while it is null
 * 
 * Cleared on unmount and whenever `delay` changes.
 */
export function useTimeout(callback: () => void, delay: number | null): void {
  const saved = useLatest(callback);

  useEffect(() => {
    if (delay === null) return;
    const id = setTimeout(() => saved.current(), delay);
    return () => clearTimeout(id);
  }, [delay, saved]);
}
