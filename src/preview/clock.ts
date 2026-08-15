export interface PreviewClock {
  now(): number;
}

const wallClock: PreviewClock = { now: () => Date.now() };
let active: PreviewClock = wallClock;

/** Shared time source for all mock generators. One clock means related
 *  previews animate in phase, and injecting a fixed/stepped clock makes
 *  every generated frame reproducible (screenshots, future tests). */
export const previewClock: PreviewClock = { now: () => active.now() };

export function setPreviewClock(clock: PreviewClock | null) {
  active = clock ?? wallClock;
}
