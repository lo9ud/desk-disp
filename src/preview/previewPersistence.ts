import { Scope } from "../ffi_types";

/** Instance-id prefix marking a widget as a throwaway preview instance.
 *  Nothing parses widget ids, so this namespace is safe to claim. */
export const PREVIEW_ID_PREFIX = "preview:";

export function previewInstanceId(defId: string): string {
  return `${PREVIEW_ID_PREFIX}${defId}`;
}

export function isPreviewScope(scope: Scope): boolean {
  return "Widget" in scope && scope.Widget.startsWith(PREVIEW_ID_PREFIX);
}

// In-memory stand-in for the backend's file store. Preview widgets (including
// applets, whose fallback producers *write* on first use) must never touch
// disk or leave stray w_preview:* scope directories behind.
const store = new Map<string, unknown>();

function storeKey(scope: Scope, collection: string | undefined, key: string) {
  return `${JSON.stringify(scope)}:${collection ?? ""}:${key}`;
}

export function previewGet<T>(
  scope: Scope,
  collection: string | undefined,
  key: string,
): T | null {
  const value = store.get(storeKey(scope, collection, key));
  return value === undefined ? null : (value as T);
}

export function previewSet<T>(
  scope: Scope,
  collection: string | undefined,
  key: string,
  value: T,
): void {
  store.set(storeKey(scope, collection, key), value);
}

export function previewDelete(
  scope: Scope,
  collection: string | undefined,
  key: string,
): void {
  store.delete(storeKey(scope, collection, key));
}

export function previewList(scope: Scope, collection: string): string[] {
  const prefix = `${JSON.stringify(scope)}:${collection}:`;
  return [...store.keys()]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}
