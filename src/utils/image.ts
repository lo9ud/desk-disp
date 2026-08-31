/**
 * Media-type sniffing for base64 image payloads.
 */

const SIGNATURES: ReadonlyArray<readonly [prefix: string, mime: string]> = [
  ["/9j/", "image/jpeg"], // FF D8 FF
  ["iVBORw0KGgo", "image/png"], // 89 50 4E 47 0D 0A 1A 0A
  ["PHN2", "image/svg+xml"], // "<sv"
  ["PD94bWw", "image/svg+xml"], // "<?xml "
];

/**
 * Unrecognised payloads fall back to JPEG
 */
const FALLBACK_MIME = "image/jpeg";

/** Wraps a base64 image payload in a data URL, typed from its magic bytes. */
export function imageDataUrl(b64: string): string {
  const mime =
    SIGNATURES.find(([prefix]) => b64.startsWith(prefix))?.[1] ?? FALLBACK_MIME;
  return `data:${mime};base64,${b64}`;
}
