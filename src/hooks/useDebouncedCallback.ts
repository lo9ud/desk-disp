import { useCallback, useMemo, useRef } from "react";
import { useLatest } from "./useLatest";

/**
 * Returns a debounced version of `fn` that fires `delay` ms after the last
 * call. If `maxWait` is given, it also guarantees a call at least every
 * `maxWait` ms while calls keep arriving.
 * 
 * The latest arguments are always used when it fires.
 */
export interface DebouncedCallback<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void;
  /** Fire the pending call now, if there is one. */
  flush(): void;
  /** Drop the pending call without firing it. */
  cancel(): void;
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
  maxWait?: number,
): DebouncedCallback<T> {
  const fnRef = useLatest(fn);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgs = useRef<Parameters<T> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    latestArgs.current = null;
  }, []);

  const fire = useCallback(() => {
    const args = latestArgs.current;
    cancel();
    if (args) fnRef.current(...args);
  }, [cancel, fnRef]);

  return useMemo(() => {
    const debounced = ((...args: Parameters<T>) => {
      latestArgs.current = args;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fire, delay);
      if (maxWait !== undefined && !maxTimerRef.current) {
        maxTimerRef.current = setTimeout(fire, maxWait);
      }
    }) as DebouncedCallback<T>;
    debounced.flush = fire;
    debounced.cancel = cancel;
    return debounced;
  }, [delay, maxWait, fire, cancel]);
}
