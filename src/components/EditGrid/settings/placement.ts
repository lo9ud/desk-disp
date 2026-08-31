export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

type Side = "right" | "left" | "below" | "above";

const MARGIN = 12;
/** Sides in preference order; the first with enough room wins. */
const SIDES: Side[] = ["right", "left", "below", "above"];

/**
 * Best-effort placement for the settings panel. Adjecent to the anchor if possible, otherwise in the roomiest direction, clamped to the bounds.
 */
export function placePanel(anchor: Rect, panel: Size, bounds: Rect): Rect {
  const minX = bounds.x + MARGIN;
  const minY = bounds.y + MARGIN;
  const clampX = (x: number) =>
    Math.min(
      Math.max(x, minX),
      Math.max(minX, bounds.x + bounds.w - panel.w - MARGIN),
    );
  const clampY = (y: number) =>
    Math.min(
      Math.max(y, minY),
      Math.max(minY, bounds.y + bounds.h - panel.h - MARGIN),
    );

  const centredY = clampY(anchor.y + anchor.h / 2 - panel.h / 2);
  const centredX = clampX(anchor.x + anchor.w / 2 - panel.w / 2);

  const originFor = (side: Side): { x: number; y: number } => {
    switch (side) {
      case "right":
        return { x: anchor.x + anchor.w + MARGIN, y: centredY };
      case "left":
        return { x: anchor.x - panel.w - MARGIN, y: centredY };
      case "below":
        return { x: centredX, y: anchor.y + anchor.h + MARGIN };
      case "above":
        return { x: centredX, y: anchor.y - panel.h - MARGIN };
    }
  };

  // Space outside the widget on each side, within the allowed bounds.
  const roomFor = (side: Side): number => {
    switch (side) {
      case "right":
        return bounds.x + bounds.w - (anchor.x + anchor.w);
      case "left":
        return anchor.x - bounds.x;
      case "below":
        return bounds.y + bounds.h - (anchor.y + anchor.h);
      case "above":
        return anchor.y - bounds.y;
    }
  };

  const needFor = (side: Side) =>
    (side === "right" || side === "left" ? panel.w : panel.h) + MARGIN * 2;

  const fits = SIDES.find((side) => roomFor(side) >= needFor(side));
  if (fits) return { ...originFor(fits), w: panel.w, h: panel.h };

  const roomiest = SIDES.reduce((a, b) => (roomFor(a) >= roomFor(b) ? a : b));
  const origin = originFor(roomiest);
  return {
    x: clampX(origin.x),
    y: clampY(origin.y),
    w: panel.w,
    h: panel.h,
  };
}
