/**
 * Cover art for the mock media stream's synthetic tracks.
 *
 * Drawn rather than bundled, for two reasons. Real cover images would be tens of
 * KB of base64 each sitting in the repo; and any real album art is a copyrighted
 * work in its own right, separate from the recording, which this app has no
 * licence to redistribute. These are a few hundred bytes each and belong to
 * nobody.
 *
 * Kept out of `mockStreams.ts` so the stream generators stay readable — the SVG
 * bodies would otherwise dominate that file and every diff touching it.
 *
 * Like the generators next door, everything here is deterministic: no
 * `Math.random`, so a fixed clock still produces byte-identical frames.
 */

/** `btoa` is Latin-1 only, so every builder below stays strictly ASCII. */
function svgToBase64(svg: string): string {
  return btoa(svg.replace(/\s+/g, " ").trim());
}

const SIZE = 600;

/* --- "Weightless Horizon" — a sun going down into a flat plane. --- */

const HORIZON_Y = 392;

/** Ragged light on the water below the horizon, fading with distance. */
const REFLECTIONS: [x: number, y: number, w: number, h: number, o: number][] = [
  [250, 410, 100, 5, 0.55],
  [222, 434, 156, 4, 0.45],
  [264, 458, 72, 4, 0.38],
  [200, 486, 200, 3, 0.3],
  [268, 514, 64, 3, 0.24],
  [232, 546, 136, 2, 0.18],
];

const weightlessHorizon = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0a2e"/>
      <stop offset="0.42" stop-color="#4c1d95"/>
      <stop offset="0.70" stop-color="#c026d3"/>
      <stop offset="0.87" stop-color="#fb7185"/>
      <stop offset="1" stop-color="#fbbf24"/>
    </linearGradient>
    <radialGradient id="halo">
      <stop offset="0" stop-color="#fff7ed" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#fff7ed" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>
  <circle cx="300" cy="${HORIZON_Y}" r="170" fill="url(#halo)"/>
  <circle cx="300" cy="${HORIZON_Y}" r="84" fill="#fffbeb" opacity="0.94"/>
  <rect y="${HORIZON_Y}" width="${SIZE}" height="${SIZE - HORIZON_Y}" fill="#07061f" opacity="0.85"/>
  <g fill="#fde68a">
    ${REFLECTIONS.map(
      ([x, y, w, h, o]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" opacity="${o}"/>`,
    ).join("")}
  </g>
</svg>`;

/* --- "Synthetic Sunrise" — slotted disc over a perspective grid. --- */

const GROUND_Y = 372;
const VANISH_X = 300;

/** Bars masked out of the disc, widening toward the horizon. */
const SLOTS: [y: number, h: number][] = [
  [286, 5],
  [306, 7],
  [330, 9],
  [358, 12],
];

/** Where each radiating line meets the bottom edge. Even spacing there is what
 *  reads as perspective, since they all converge on one point. */
const RAYS = Array.from({ length: 15 }, (_, i) => VANISH_X + (i - 7) * 86);

/** Gaps grow with distance from the horizon; the exponent sets how fast. */
const RUNGS = Array.from({ length: 8 }, (_, i) =>
  Math.round(GROUND_Y + (SIZE - GROUND_Y) * Math.pow((i + 1) / 8, 2.2)),
);

const syntheticSunrise = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b0736"/>
      <stop offset="0.55" stop-color="#7c1d6f"/>
      <stop offset="1" stop-color="#fb923c"/>
    </linearGradient>
    <linearGradient id="disc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fef08a"/>
      <stop offset="0.5" stop-color="#fb923c"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
    <mask id="slots">
      <rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>
      <g fill="#000000">
        ${SLOTS.map(
          ([y, h]) => `<rect y="${y}" width="${SIZE}" height="${h}"/>`,
        ).join("")}
      </g>
    </mask>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>
  <circle cx="${VANISH_X}" cy="248" r="132" fill="url(#disc)" mask="url(#slots)"/>
  <rect y="${GROUND_Y}" width="${SIZE}" height="${SIZE - GROUND_Y}" fill="#14042c"/>
  <g stroke="#f472b6" stroke-width="2" opacity="0.8">
    ${RAYS.map(
      (x) => `<path d="M${VANISH_X} ${GROUND_Y}L${x} ${SIZE}"/>`,
    ).join("")}
    ${RUNGS.map(
      (y) => `<path d="M0 ${y}H${SIZE}"/>`,
    ).join("")}
  </g>
</svg>`;

/* --- "Grid Lines" — hard geometry, no gradients, to contrast the other two. --- */

const RULES = [75, 150, 225, 300, 375, 450, 525];

const gridLines = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#0b1120"/>
  <rect x="75" y="150" width="150" height="150" fill="#f43f5e"/>
  <rect x="300" y="300" width="225" height="150" fill="#22d3ee"/>
  <rect x="375" y="75" width="150" height="75" fill="#facc15"/>
  <circle cx="187" cy="412" r="75" fill="#a78bfa"/>
  <g stroke="#e2e8f0" stroke-width="2" opacity="0.9">
    ${RULES.map((v) => `<path d="M${v} 0V${SIZE}"/>`).join("")}
    ${RULES.map((v) => `<path d="M0 ${v}H${SIZE}"/>`).join("")}
  </g>
  <rect x="3" y="3" width="${SIZE - 6}" height="${SIZE - 6}" fill="none" stroke="#e2e8f0" stroke-width="6"/>
</svg>`;

export const MOCK_ALBUM_ART = {
  weightlessHorizon: svgToBase64(weightlessHorizon),
  syntheticSunrise: svgToBase64(syntheticSunrise),
  gridLines: svgToBase64(gridLines),
} as const;
