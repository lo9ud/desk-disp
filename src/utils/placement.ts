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

export type Side = "right" | "left" | "below" | "above";

export interface Placement {
  rect: Rect;
  /** Side of the anchor the panel sits on, or null when the anchor lies outside
   *  `bounds` and no side is meaningful. */
  side: Side | null;
}

const MARGIN = 12;
/** Sides in preference order; the first with enough room wins. */
const SIDES: Side[] = ["right", "left", "below", "above"];

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Best-effort placement for a floating panel. Adjacent to the anchor if possible, otherwise in the roomiest direction, clamped to the bounds. An anchor outside the bounds has no meaningful side, so the panel is centred and reported as `side: null`.
 *
 * `prefer` moves one side to the front of the preference order when it fits — for a
 * target hard against a screen edge the geometric best fit is often not the obvious
 * one, and a caller that knows the layout can just say so.
 */
export function placePanel(
  anchor: Rect,
  panel: Size,
  bounds: Rect,
  prefer?: Side,
): Placement {
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

  if (!intersects(anchor, bounds)) {
    return {
      rect: {
        x: clampX(bounds.x + bounds.w / 2 - panel.w / 2),
        y: clampY(bounds.y + bounds.h / 2 - panel.h / 2),
        w: panel.w,
        h: panel.h,
      },
      side: null,
    };
  }

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

  // Space outside the anchor on each side, within the allowed bounds.
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

  const order = prefer
    ? [prefer, ...SIDES.filter((s) => s !== prefer)]
    : SIDES;
  const fits = order.find((side) => roomFor(side) >= needFor(side));
  if (fits) {
    return { rect: { ...originFor(fits), w: panel.w, h: panel.h }, side: fits };
  }

  const roomiest = SIDES.reduce((a, b) => (roomFor(a) >= roomFor(b) ? a : b));
  const origin = originFor(roomiest);
  return {
    rect: {
      x: clampX(origin.x),
      y: clampY(origin.y),
      w: panel.w,
      h: panel.h,
    },
    side: roomiest,
  };
}
