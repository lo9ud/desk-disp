import { useEffect } from "react";
import { useLatest } from "./useLatest";

/**
 * Calls `callback` every `delay` ms, or not at all while `delay` is null
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useLatest(callback);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay, saved]);
}
