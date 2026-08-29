/**
 * Instance-id prefix marking a widget as a throwaway preview instance.
 *
 * Purely a debugging aid now. It used to be load-bearing: persistence handles
 * checked for it to decide between disk and an in-memory map, which was one of
 * the three ad-hoc interception mechanisms the runtime replaced. Preview is now
 * decided by which runtime the subtree is rendered under, so this only makes a
 * stray preview id recognisable in a log line.
 */
export const PREVIEW_ID_PREFIX = "preview:";

export function previewInstanceId(defId: string): string {
  return `${PREVIEW_ID_PREFIX}${defId}`;
}
