export interface Stats {
  min: number;
  max: number;
  avg: number;
  median: number;
  last: number;
}

const EMPTY: Stats = { min: 0, max: 0, avg: 0, median: 0, last: 0 };

/** Pure function — wrap with useMemo if used in a hot render path. */
export function computeStats(values: readonly number[]): Stats {
  if (values.length === 0) return EMPTY;

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return { min, max, avg, median, last: values[values.length - 1] };
}
