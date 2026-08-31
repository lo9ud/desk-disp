import type { Target, TourCtx } from "./types";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function toBox(r: DOMRect): Box {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return right > x && bottom > y
    ? { x, y, w: right - x, h: bottom - y }
    : null;
}

export function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Overlapping subpaths cancel under `evenodd`, so two holes that intersect leave
 * a patch of scrim in the intersection. Merging to bounding boxes over-cuts a
 * little but never produces that artifact.
 */
export function mergeOverlapping(boxes: Box[]): Box[] {
  const out = [...boxes];
  for (let merged = true; merged; ) {
    merged = false;
    search: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (!intersect(out[i], out[j])) continue;
        out[i] = union([out[i], out[j]])!;
        out.splice(j, 1);
        merged = true;
        break search;
      }
    }
  }
  return out;
}

export function contains(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

export function inflate(b: Box, by: number): Box {
  return { x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 };
}

export function viewportBox(): Box {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

export function boxKey(boxes: Box[]): string {
  return boxes.map((b) => `${b.x | 0},${b.y | 0},${b.w | 0},${b.h | 0}`).join("|");
}

function selectorsFor(t: Target): string[] {
  switch (t.kind) {
    case "chrome":
      return t.names.map((n) => `[data-onboarding="${n}"]`);
    case "widget":
      return t.ids.map((id) => `[data-widget-id="${id}"]`);
    case "widgetPart":
      return t.ids.flatMap((id) =>
        t.parts.map((p) => `[data-widget-id="${id}"] [data-onboarding="${p}"]`),
      );
    case "railCard":
      return t.defIds.map((d) => `[data-widget-def="${d}"]`);
  }
}

export function resolveTargets(
  targets: Target[] | ((ctx: TourCtx) => Target[]),
  ctx: TourCtx,
): HTMLElement[] {
  const list = typeof targets === "function" ? targets(ctx) : targets;
  const found = list.flatMap((t) =>
    selectorsFor(t).flatMap((s) => [
      ...document.querySelectorAll<HTMLElement>(s),
    ]),
  );
  const unique = [...new Set(found)];
  // An edit-mode tile and the widget shell inside it carry the same id; only the
  // outer one is ever the right ring.
  return unique.filter(
    (el) => !unique.some((other) => other !== el && other.contains(el)),
  );
}

/** Ancestors that clip, collected once per step so the measure loop only has to
 *  intersect rects. */
export function clippingAncestors(el: Element): Element[] {
  const out: Element[] = [];
  let node = el.parentElement;
  while (node) {
    const s = getComputedStyle(node);
    if (s.overflowX !== "visible" || s.overflowY !== "visible") out.push(node);
    node = node.parentElement;
  }
  return out;
}

export function visibleBox(el: Element, clippers: Element[]): Box | null {
  let box: Box | null = toBox(el.getBoundingClientRect());
  for (const c of clippers) {
    box = intersect(box, toBox(c.getBoundingClientRect()));
    if (!box) return null;
  }
  return intersect(box, viewportBox());
}

/** Scrolls only when the element isn't already fully in view, so a step doesn't
 *  jolt the page for nothing. */
export function ensureVisible(el: Element, clippers: Element[]): void {
  const full = toBox(el.getBoundingClientRect());
  const seen = visibleBox(el, clippers);
  if (seen && seen.w >= full.w - 1 && seen.h >= full.h - 1) return;
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

function roundedRectPath(b: Box, radius: number): string {
  const r = Math.max(0, Math.min(radius, b.w / 2, b.h / 2));
  const { x, y, w, h } = b;
  return [
    `M${x + r} ${y}`,
    `H${x + w - r}`,
    `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + h - r}`,
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
}

/**
 * Outer viewport rect plus one subpath per hole. Used as `clip-path`, not an SVG
 * mask, because clipping also removes the holes from hit-testing — which is what
 * lets a click land on the real element underneath.
 */
export function cutoutPath(holes: Box[], radius = 6): string {
  const v = viewportBox();
  const outer = `M0 0 H${v.w} V${v.h} H0 Z`;
  return [outer, ...holes.map((h) => roundedRectPath(h, radius))].join(" ");
}
