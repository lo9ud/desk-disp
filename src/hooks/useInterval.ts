import { useEffect } from "react";
import { useLatest } from "./useLatest";

/**
 * Calls `callback` every `delay` ms, or not at all while `delay` is null --
 * a pause is expressed as a null delay so callers need no second flag. The
 * callback is read through a ref, so passing a fresh closure every render
 * neither restarts the timer nor pins the first one.
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useLatest(callback);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay, saved]);
}
