/**
 * Media-type sniffing for base64 image payloads.
 *
 * `MediaState.album_art_b64` deliberately does not declare its type: SMTC hands
 * back whichever raster format the source app happened to embed, and the preview
 * streams emit SVG. Rather than widen the FFI struct with a mime field that every
 * producer would have to get right, the consumer reads it off the payload itself.
 *
 * Base64 packs 3 bytes into 4 characters from a fixed offset, so a known leading
 * byte sequence always encodes to the same leading characters. Matching on those
 * needs no decode — the prefixes below are chosen to be exactly as long as their
 * signature fully determines.
 */

const SIGNATURES: ReadonlyArray<readonly [prefix: string, mime: string]> = [
  ["/9j/", "image/jpeg"], // FF D8 FF
  ["iVBORw0KGgo", "image/png"], // 89 50 4E 47 0D 0A 1A 0A
  ["PHN2", "image/svg+xml"], // "<sv"
  ["PD94bWw", "image/svg+xml"], // "<?xml "
];

/**
 * Unrecognised payloads fall back to JPEG, which is what this was hardcoded to
 * before sniffing existed and what the overwhelming majority of SMTC thumbnails
 * actually are. Browsers sniff `<img>` data URLs themselves regardless, so a
 * wrong guess here is survivable rather than fatal.
 */
const FALLBACK_MIME = "image/jpeg";

/** Wraps a base64 image payload in a data URL, typed from its own magic bytes. */
export function imageDataUrl(b64: string): string {
  const mime =
    SIGNATURES.find(([prefix]) => b64.startsWith(prefix))?.[1] ?? FALLBACK_MIME;
  return `data:${mime};base64,${b64}`;
}
