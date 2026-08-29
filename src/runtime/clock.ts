/**
 * Time source, injected rather than read from `Date.now()` directly, so a preview
 * or test runtime can drive widget time deterministically. Mock stream generators
 * are pure over `t`, so a fixed or stepped clock makes every generated frame
 * reproducible.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** Advances only when told to. Useful for screenshots and future tests. */
export function fixedClock(startMs = 0): Clock & { set(ms: number): void; advance(ms: number): void } {
  let t = startMs;
  return {
    now: () => t,
    set: (ms) => {
      t = ms;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}
