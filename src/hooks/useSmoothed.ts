import { useEffect, useState } from "react";

/**
 * Exponential moving average: smoothed = prev + alpha * (value - prev).
 *
 * alpha=1.0  → no smoothing (returns value immediately)
 * alpha=0.1  → heavy smoothing (slow to respond)
 * alpha=0.3  → default, moderate lag
 */
export function useSmoothed(value: number, alpha = 0.3): number {
  const [smoothed, setSmoothed] = useState(value);

  useEffect(() => {
    setSmoothed((prev) => prev + alpha * (value - prev));
  }, [value, alpha]);

  return smoothed;
}
