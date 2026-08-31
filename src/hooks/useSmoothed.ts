import { useEffect, useState } from "react";

/**
 * Exponential moving average of a numeric value, updated whenever the value changes.
 * 
 * @param value The latest value to smooth.
 * @param [alpha=0.3] The smoothing factor, between 0 and 1. Defaults to 0.3.
 * @returns The smoothed value.
 */
export function useSmoothed(value: number, alpha = 0.3): number {
  const [smoothed, setSmoothed] = useState(value);

  useEffect(() => {
    setSmoothed((prev) => prev + alpha * (value - prev));
  }, [value, alpha]);

  return smoothed;
}
