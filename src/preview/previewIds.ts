/**
 * Instance-id prefix marking a widget as a throwaway preview instance.
 */
export const PREVIEW_ID_PREFIX = "preview:";

export function previewInstanceId(defId: string): string {
  return `${PREVIEW_ID_PREFIX}${defId}`;
}
