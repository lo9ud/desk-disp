import { useEffect, useState } from "react";
import { useLatest } from "./useLatest";

/**
 * Maintains a rolling array of the last `length` values of `value`.
 * Updates whenever `value` changes (by reference/equality).
 *
 * Note: if consecutive emissions produce the same primitive value (e.g. CPU
 * stays exactly at 50.0 for two ticks) the history will not advance for that
 * tick. In practice monitoring values fluctuate enough that this is invisible.
 * 
 * @param value - The latest value to add to the history.
 * @param length - The maximum number of values to keep in the history.
 * @param fill - The value to use for uninitialized history slots. Defaults to `null`.
 * @returns An array of the last `length` values, with the most recent at the end.
 */
export function useHistory<T>(
  value: T,
  length = 60,
  fill: T = null as unknown as T,
): readonly T[] {
  const [history, setHistory] = useState<T[]>(new Array(length).fill(fill));
  const lengthRef = useLatest(length);

  useEffect(() => {
    setHistory((h) => {
      const next = [...h, value];
      const l = lengthRef.current;
      return next.length > l ? next.slice(next.length - l) : next;
    });
  }, [value, lengthRef]);

  return history;
}
