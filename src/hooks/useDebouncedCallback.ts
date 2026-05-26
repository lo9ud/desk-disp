import { useCallback, useRef } from "react";

/**
 * Returns a debounced version of `fn` that fires `delay` ms after the last
 * call, but guarantees a call at least every `maxWait` ms while calls keep
 * arriving. The latest arguments are always used when it fires.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
  maxWait: number,
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
    if (!maxTimerRef.current) {
      maxTimerRef.current = setTimeout(fire, maxWait);
    }
  }, [delay, maxWait, fire]) as T;
}
