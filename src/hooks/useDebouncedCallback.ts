import { useCallback, useRef } from "react";

/**
 * Returns a debounced version of `fn` that fires `delay` ms after the last
 * call. If `maxWait` is given, it also guarantees a call at least every
 * `maxWait` ms while calls keep arriving -- useful for "keep giving live
 * feedback during a long continuous interaction" (e.g. ColorInput's own
 * usage). Omit `maxWait` for a pure trailing debounce that never fires
 * while calls are still arriving, only once they stop -- the right choice
 * for "wait until the user is done, then compute" uses (see
 * useDebouncedAsyncValue), where firing mid-interaction isn't a feature.
 * The latest arguments are always used when it fires.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
  maxWait?: number,
): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgs = useRef<Parameters<T> | null>(null);

  const fire = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    if (latestArgs.current) fnRef.current(...latestArgs.current);
  }, []);

  return useCallback((...args: Parameters<T>) => {
    latestArgs.current = args;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fire, delay);
    if (maxWait !== undefined && !maxTimerRef.current) {
      maxTimerRef.current = setTimeout(fire, maxWait);
    }
  }, [delay, maxWait, fire]) as T;
}
