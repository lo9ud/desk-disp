import { useEffect, useRef, useState } from "react";

/**
 * Maintains a rolling array of the last `length` values of `value`.
 * Updates whenever `value` changes (by reference/equality).
 *
 * Note: if consecutive emissions produce the same primitive value (e.g. CPU
 * stays exactly at 50.0 for two ticks) the history will not advance for that
 * tick. In practice monitoring values fluctuate enough that this is invisible.
 */
export function useHistory<T>(value: T, length = 60): readonly T[] {
  const [history, setHistory] = useState<T[]>(new Array(length).fill(0));
  const lengthRef = useRef(length);
  lengthRef.current = length;

  useEffect(() => {
    setHistory((h) => {
      const next = [...h, value];
      const l = lengthRef.current;
      return next.length > l ? next.slice(next.length - l) : next;
    });
    // lengthRef intentionally omitted — it's a ref, not reactive state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return history;
}
