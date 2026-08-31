import { useCallback, useEffect, useRef } from "react";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";
import { useWidgetApi } from "../../runtime/context";
import styles from "./styles/VisualizerWidget.module.css";
import { FrequencyReading } from "../../ffi_types";

const VISUALIZER_SETTINGS_DEF = {
  style: {
    label: "Style",
    type: "select",
    default: "bars",
    options: {
      bars: {
        label: "Bars",
        settings: {
          direction: {
            label: "Direction",
            type: "select",
            options: {
              vertical: "Vertical",
              horizontal: "Horizontal",
              circular: "Circular",
            },
            default: "vertical",
          },
          freqOrder: {
            label: "Frequency order",
            type: "select",
            options: {
              asc: "Ascending",
              desc: "Descending",
            },
            default: "asc",
          },
          extentSource: {
            label: "Bar origin",
            type: "select",
            options: {
              start: "Start",
              end: "End",
              center: "Center",
              split: "Edges",
            },
            default: "start",
            showWhen: { key: "direction", is: ["vertical", "horizontal"] },
          },
          mirrorFreq: {
            label: "Mirror frequency",
            type: "boolean",
            default: false,
            showWhen: { key: "direction", is: ["vertical", "horizontal"] },
          },
          mirror: {
            label: "Mirror",
            type: "select",
            options: {
              none: "None",
              vert: "Vertically",
              horiz: "Horizontally",
              both: "Both",
            },
            default: "none",
            showWhen: { key: "direction", is: "circular" },
          },
          barStyle: {
            label: "Bar Style",
            type: "select",
            options: {
              bar: "Bar",
              stack: "Stack",
            },
            default: "bar",
          },
          stackBlockSize: {
            label: "Block size",
            type: "number",
            min: 4,
            max: 30,
            step: 2,
            default: 10,
            unit: "px",
            showWhen: { key: "barStyle", is: "stack" },
          },
          barCount: {
            label: "Bar count",
            type: "number",
            steps: [8, 12, 16, 24, 32, 48, 64, 96, 128],
            default: 32,
          },
          innerRadius: {
            label: "Inner radius",
            type: "number",
            min: 0,
            max: 0.9,
            step: 0.05,
            default: 0.5,
            showWhen: { key: "direction", is: "circular" },
          },
          origin: {
            label: "Origin",
            type: "number",
            steps: [0, 45, 90, 135, 180, 225, 270, 315, 360],
            default: 1.5,
            unit: "°",
            showWhen: { key: "direction", is: "circular" },
          },
        },
      },
      waveform: { label: "Waveform" },
    },
  },
  freqTrimTop: {
    label: "Trim top frequencies",
    type: "number",
    min: 0,
    max: 50,
    step: 5,
    default: 10,
    unit: "%",
  },
  freqTrimBottom: {
    label: "Trim bottom frequencies",
    type: "number",
    min: 0,
    max: 50,
    step: 5,
    default: 10,
    unit: "%",
  },
  showWhenIdle: { label: "Show when idle", type: "boolean", default: false },
} satisfies WidgetSettingsDefinition;

export function Visualizer({
  style,
  direction,
  barCount,
  showWhenIdle,
  mirror,
  freqOrder,
  extentSource,
  mirrorFreq,
  barStyle,
  stackBlockSize,
  innerRadius,
  origin,
  freqTrimBottom,
  freqTrimTop,
}: WidgetSettingsProps<typeof VISUALIZER_SETTINGS_DEF>) {
  const trim = { bottom: freqTrimBottom, top: freqTrimTop };

  if (style === "bars") {
    if (["vertical", "horizontal"].includes(direction)) {
      return (
        <BarsVisualizer
          trim={trim}
          barCount={barCount}
          showWhenIdle={showWhenIdle}
          direction={direction}
          freqOrder={freqOrder}
          extentSource={extentSource}
          mirrorFreq={mirrorFreq}
          barStyle={barStyle}
          stackBlockSize={stackBlockSize}
        />
      );
    } else if (direction === "circular") {
      return (
        <RadialBars
          trim={trim}
          innerRadius={innerRadius}
          barCount={barCount}
          showWhenIdle={showWhenIdle}
          mirror={mirror}
          freqOrder={freqOrder}
          barStyle={barStyle}
          stackBlockSize={stackBlockSize}
          origin={origin}
        />
      );
    } // no else needed, direction is validated by settingsDef
  } else if (style === "waveform") {
    return <Waveform trim={trim} smoothing={0.5} showWhenIdle={showWhenIdle} />;
  } // no else needed, style is validated by settingsDef
}

/* Imperative draw path  */

type FreqTrim = { bottom: number; top: number };

/** Receives the trimmed frame and the accent colour; draws, returns nothing. */
type DrawFn = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: FrequencyReading[] | null,
  color: string,
) => void;

/**
 * Owns the canvas, the visualizer subscription and the repaint policy for all
 * three renderers.
 */
function useStreamCanvas(trim: FreqTrim, showWhenIdle: boolean, draw: DrawFn) {
  const api = useWidgetApi();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<FrequencyReading[] | null>(null);
  const idleRef = useRef<IdleState>({ silentSince: null, mix: 0, at: null });
  const rafRef = useRef<number | null>(null);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const trimRef = useRef(trim);
  trimRef.current = trim;
  const showWhenIdleRef = useRef(showWhenIdle);
  showWhenIdleRef.current = showWhenIdle;

  // Indirection so the animation loop can be a stable callback that always runs
  // the current paint, rather than paint having to reference itself.
  const paintRef = useRef<() => void>(undefined);
  const tick = useCallback(() => {
    rafRef.current = null;
    paintRef.current?.();
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Keep the backing store matched to the parent CSS box
    if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
    if (canvas.height !== canvas.clientHeight)
      canvas.height = canvas.clientHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const raw = frameRef.current;
    const idle = idleRef.current;
    const now = api.now();
    const settled = advanceIdle(idle, raw, now);

    const { bottom, top } = trimRef.current;
    // Trim first, then overlay: the idle animation is not frequency data, so it
    // spans the bars actually on screen rather than being clipped by a trim.
    const live = raw
      ? raw.slice(
          Math.floor((raw.length * bottom) / 100),
          Math.ceil(raw.length * (1 - top / 100)),
        )
      : null;

    let frame: FrequencyReading[] | null;
    if (!showWhenIdleRef.current) frame = settled ? null : live;
    else if (idle.mix > 0) frame = blendIdle(live, idle.mix, now);
    else frame = live;

    const color = globalThis
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim();

    drawRef.current(ctx, canvas, frame, color);

    const pending = showWhenIdleRef.current
      ? idle.silentSince !== null || idle.mix > 0
      : idle.silentSince !== null && !settled;
    if (pending && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [api, tick]);
  paintRef.current = paint;

  useEffect(() => {
    // Seed from the hub's retained frame so a remount draws immediately.
    frameRef.current = api.streams.latest("visualizer");
    paint();
    const unsubscribe = api.streams.subscribe("visualizer", (frame) => {
      frameRef.current = frame;
      // While the idle loop is running it repaints on the next animation frame
      // anyway; painting here too would just paint the same state twice.
      if (rafRef.current === null) paint();
    });
    return () => {
      unsubscribe();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [api, paint]);

  // No dep array: the component only re-renders when a setting changed, and that
  // is exactly when the last frame needs repainting with the new settings.
  useEffect(paint);

  return canvasRef;
}

function VisualizerCanvas({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  // Width/height are set in `paint` from the live client box rather than as
  // render-time attributes, which read as `undefined` on the first pass and
  // never updated on resize.
  return <canvas ref={canvasRef} className={styles.visualizer} />;
}

const VisualizerWidget = registerWidget(Visualizer, {
  id: "visualizer",
  name: "Visualizer",
  description:
    "Shows a live animation that reacts to audio playing on your system",
  category: "media",
  tags: [],
  settingsDef: VISUALIZER_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
  presetsSettings: [
    {
      mirrorFreq: true,
    },
    {
      barStyle: "stack",
      extentSource: "center",
      mirrorFreq: true,
    },
    {
      direction: "horizontal",
      extentSource: "split",
    },
    {
      direction: "circular",
      mirror: "vert",
      origin: 90,
    }
  ],
});

export default VisualizerWidget;

// anchor: "near"   -> anchored at the near edge along the length axis (y / x); grows toward the far edge.
// anchor: "far"    -> anchored at the far edge (y+h / x+w); grows toward the near edge.
// anchor: "middle" -> anchored at the rect's midpoint; grows outward toward both edges symmetrically.
// The length axis is h for vertical bars, w for horizontal bars (the other is thickness).
type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: "near" | "far" | "middle";
};

// Gap between adjacent bars along the thickness axis. Stack mode caps its own
// segment-to-segment gap at this value so both axes of the LED grid line up.
const BAR_GAP = 2;

// Sort-of exponential scaling of the backend's peak-normalised magnitude to a height in the 0..1 range.
const MAG_CUTOFF = 0.4;
const MAG_SCALE = Math.pow(2, 7.65); // = approx 200

function scaleValue(value: number, cutoff: number, scale: number) {
  // Roughly:
  // Values less than cutoff are aggressively reduced to near zero
  // Values greater than cutoff are exponentially scaled so that 1 maps to 1, and cutoff maps to a small value close to zero
  return Math.max(
    (Math.pow(scale, (value - cutoff) / (1 - cutoff)) - 1) / (scale - 1),
    0.001,
  );
}

/** Inverse of `scaleValue`: the magnitude that renders as `height`. */
function magnitudeForHeight(height: number) {
  return (
    MAG_CUTOFF +
    ((1 - MAG_CUTOFF) * Math.log(height * (MAG_SCALE - 1) + 1)) /
      Math.log(MAG_SCALE)
  );
}

function normalizeData(frequencies: FrequencyReading[] | null) {
  return (
    frequencies?.map((d) => ({
      freq: Math.log(d.freq_hi + d.freq_lo),
      magnitude: scaleValue(d.magnitude, MAG_CUTOFF, MAG_SCALE),
    })) ?? null
  );
}

/* Idle animation  */

const TAU = Math.PI * 2;

/** Below this, a bin counts as quiet */
const IDLE_QUIET_MAGNITUDE = 0.05;
/** How long quiet must persist before the animation takes over */
const IDLE_ENTER_MS = 1500;
const IDLE_FADE_IN_MS = 1200;
const IDLE_FADE_OUT_MS = 250;

type IdleState = {
  /** When the stream first went quiet; null while something is playing. */
  silentSince: number | null;
  /** 0 = incoming frame only, 1 = idle animation fully faded in. */
  mix: number;
  /** Previous paint's timestamp */
  at: number | null;
};

/**
 * Advances the idle state machine by one paint, returning whether the stream
 * has now been quiet long enough to count as idle.
 */
function advanceIdle(
  state: IdleState,
  raw: FrequencyReading[] | null,
  now: number,
): boolean {
  const dt = state.at === null ? 0 : Math.max(now - state.at, 0);
  state.at = now;

  const quiet =
    raw === null || raw.every((d) => d.magnitude < IDLE_QUIET_MAGNITUDE);
  if (!quiet) state.silentSince = null;
  else state.silentSince ??= now;

  const settled =
    state.silentSince !== null && now - state.silentSince >= IDLE_ENTER_MS;
  const step = settled ? dt / IDLE_FADE_IN_MS : -dt / IDLE_FADE_OUT_MS;
  state.mix = Math.min(Math.max(state.mix + step, 0), 1);
  return settled;
}

/**
 * Bar height, 0..1, at fractional position `u` across the display.
 */
function idleHeight(u: number, t: number) {
  const travel = 0.5 + 0.5 * Math.sin(TAU * (u * 1.35 - t / 4200));
  const counter = 0.5 + 0.5 * Math.sin(TAU * (u * 0.6 + t / 6700));
  const breathe = 0.75 + 0.25 * Math.sin(TAU * (t / 5300));
  const arch = 0.6 + 0.4 * Math.sin(Math.PI * u);
  return 0.05 + 0.7 * arch * breathe * (0.55 * travel + 0.45 * counter);
}

/** Stand-in bins for when the stream has never produced a frame at all */
const IDLE_BINS: FrequencyReading[] = Array.from({ length: 64 }, (_, i) => ({
  freq_lo: 20 * Math.pow(1000, i / 64),
  freq_hi: 20 * Math.pow(1000, (i + 1) / 64),
  magnitude: 0,
}));

/**
 * Lerps the incoming frame with a generated idle animation at time `t` 
 */
function blendIdle(
  live: FrequencyReading[] | null,
  mix: number,
  t: number,
): FrequencyReading[] {
  const bins = live ?? IDLE_BINS;
  const span = Math.max(bins.length - 1, 1);
  return bins.map((bin, i) => ({
    ...bin,
    magnitude: Math.max(
      bin.magnitude,
      magnitudeForHeight(mix * idleHeight(i / span, t)),
    ),
  }));
}

function verticalBaseRects(
  i: number,
  amp: number,
  canvas: HTMLCanvasElement,
  barCount: number,
  freqOrder: string,
  extentSource: string,
): Rect[] {
  const freqI = freqOrder === "desc" ? barCount - 1 - i : i;
  const x = (freqI / barCount) * canvas.width;
  const w = Math.max(canvas.width / barCount - BAR_GAP, 1);
  const fullH = Math.max(amp * canvas.height, 1);
  const halfH = Math.max((amp * canvas.height) / 2, 1);
  switch (extentSource) {
    case "end":
      return [{ x, y: 0, w, h: fullH, anchor: "near" }];
    case "center":
      return [
        { x, y: canvas.height / 2 - fullH / 2, w, h: fullH, anchor: "middle" },
      ];
    case "split":
      return [
        { x, y: canvas.height - halfH, w, h: halfH, anchor: "far" },
        { x, y: 0, w, h: halfH, anchor: "near" },
      ];
    default:
      return [{ x, y: canvas.height - fullH, w, h: fullH, anchor: "far" }];
  }
}

function horizontalBaseRects(
  i: number,
  amp: number,
  canvas: HTMLCanvasElement,
  barCount: number,
  freqOrder: string,
  extentSource: string,
): Rect[] {
  const freqI = freqOrder === "desc" ? barCount - 1 - i : i;
  const y = (freqI / barCount) * canvas.height;
  const h = Math.max(canvas.height / barCount - BAR_GAP, 1);
  const fullW = Math.max(amp * canvas.width, 1);
  const halfW = Math.max((amp * canvas.width) / 2, 1);
  switch (extentSource) {
    case "end":
      return [{ x: canvas.width - fullW, y, w: fullW, h, anchor: "far" }];
    case "center":
      return [
        { x: canvas.width / 2 - fullW / 2, y, w: fullW, h, anchor: "middle" },
      ];
    case "split":
      return [
        { x: 0, y, w: halfW, h, anchor: "near" },
        { x: canvas.width - halfW, y, w: halfW, h, anchor: "far" },
      ];
    default:
      return [{ x: 0, y, w: fullW, h, anchor: "near" }];
  }
}

function applyMirrorFreq(
  rects: Rect[],
  cw: number,
  ch: number,
  direction: string,
): Rect[] {
  if (direction === "vertical") {
    return rects.flatMap((r) => [
      { ...r, x: r.x / 2, w: r.w / 2 },
      { ...r, x: cw - r.x / 2 - r.w, w: r.w / 2 },
    ]);
  }
  return rects.flatMap((r) => [
    { ...r, y: r.y / 2, h: r.h / 2 },
    { ...r, y: ch - r.y / 2 - r.h, h: r.h / 2 },
  ]);
}

function BarsVisualizer({
  trim,
  barCount,
  showWhenIdle,
  direction,
  freqOrder,
  extentSource,
  mirrorFreq,
  barStyle,
  stackBlockSize,
}: {
  trim: FreqTrim;
  barCount: number;
  showWhenIdle: boolean;
  direction: string;
  freqOrder: string;
  extentSource: string;
  mirrorFreq: boolean;
  barStyle: string;
  stackBlockSize: number;
}) {
  const canvasRef = useStreamCanvas(trim, showWhenIdle, (ctx, canvas, frame, color) => {
    const data = normalizeData(frame);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data) return;

    const getBaseRects =
      direction === "vertical" ? verticalBaseRects : horizontalBaseRects;
    const effectiveCount = mirrorFreq ? Math.ceil(barCount / 2) : barCount;

    for (let i = 0; i < effectiveCount; i++) {
      const freqIndex = Math.floor((i / effectiveCount) * data.length);
      const amp = data[freqIndex]?.magnitude ?? 0;
      let rects = getBaseRects(
        i,
        amp,
        canvas,
        effectiveCount,
        freqOrder,
        extentSource,
      );
      if (mirrorFreq) {
        rects = applyMirrorFreq(rects, canvas.width, canvas.height, direction);
      }
      const drawRects =
        barStyle === "stack"
          ? rects.flatMap((r) => stackSegments(r, direction, stackBlockSize))
          : rects;
      for (const r of drawRects) {
        drawBar(ctx, r.x, r.y, r.w, r.h, color);
      }
    }
  });

  return <VisualizerCanvas canvasRef={canvasRef} />;
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  // Snap edges to whole pixels. Rect coordinates come from continuous amplitude/ratio
  // math and land on a different fractional pixel each frame; fillRect anti-aliases
  // those fractional edges, which makes otherwise-identical gaps between adjacent
  // bars/segments appear to vary in width. Rounding each edge independently (rather
  // than rounding x/width separately) keeps shared boundaries between rects aligned.
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const w0 = Math.max(Math.round(x + width) - x0, 1);
  const h0 = Math.max(Math.round(y + height) - y0, 1);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y0, w0, h0);
}

function stackSegments(
  rect: Rect,
  direction: string,
  blockSize: number,
): Rect[] {
  const segmentLength = blockSize;
  const spacing = Math.min(Math.max(Math.round(blockSize / 5), 1), BAR_GAP);
  const step = segmentLength + spacing;
  const vertical = direction === "vertical";

  // Express the rect purely in terms of its length axis (h for vertical, w for
  // horizontal); the thickness axis (the other one) just gets carried through unchanged.
  const axisPos = vertical ? rect.y : rect.x;
  const axisLen = vertical ? rect.h : rect.w;
  const makeRect = (pos: number, len: number, anchor: Rect["anchor"]): Rect =>
    vertical
      ? { x: rect.x, y: pos, w: rect.w, h: len, anchor }
      : { x: pos, y: rect.y, w: len, h: rect.h, anchor };

  if (rect.anchor === "middle") {
    // Grow two independent stacks outward from the rect's midpoint, each inset by
    // half the spacing so the two innermost segments leave a normal-sized gap
    // between them instead of forming one double-length segment at the seam.
    const halfLen = Math.max(axisLen / 2 - spacing / 2, 0);
    const nearHalf = makeRect(axisPos, halfLen, "far");
    const farHalf = makeRect(
      axisPos + axisLen / 2 + spacing / 2,
      halfLen,
      "near",
    );
    return [
      ...stackSegments(nearHalf, direction, blockSize),
      ...stackSegments(farHalf, direction, blockSize),
    ];
  }

  const segmentCount = Math.max(Math.floor(axisLen / step), 0);
  const segments: Rect[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const offset = i * step;
    const pos =
      rect.anchor === "far"
        ? axisPos + axisLen - offset - segmentLength // anchored at the far edge, grow toward the near edge
        : axisPos + offset; // anchored at the near edge, grow toward the far edge
    segments.push(makeRect(pos, segmentLength, rect.anchor));
  }
  return segments;
}

function RadialBars({
  trim,
  barCount,
  showWhenIdle,
  innerRadius,
  mirror,
  freqOrder,
  barStyle,
  stackBlockSize,
  origin,
}: {
  trim: FreqTrim;
  barCount: number;
  showWhenIdle: boolean;
  innerRadius: number;
  mirror: string;
  freqOrder: string;
  barStyle: string;
  stackBlockSize: number;
  origin: number;
}) {
  const canvasRef = useStreamCanvas(trim, showWhenIdle, (ctx, canvas, frame, color) => {
    const data = normalizeData(frame);

    const mirrorFactor =
      mirror === "both" ? 4 : mirror === "vert" || mirror === "horiz" ? 2 : 1;
    const effectiveCount = Math.ceil(barCount / mirrorFactor);
    const freqToTheta = (index: number) =>
      ((index + 0.5) / effectiveCount) * 2 * Math.PI;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const density = 0.75;
    const angularWidth = ((2 * Math.PI) / barCount) * density;
    const dim = Math.min(canvas.width, canvas.height);
    const minRadius = (dim * innerRadius) / 2;
    const maxRadius = dim / 2;

    function drawRadialBar(
      innerRadius: number,
      outerRadius: number,
      angle: number,
      angularWidth: number,
      color: string,
      style: string,
    ) {
      if (style === "stack") {
        const segmentLength = stackBlockSize;
        const spacing = Math.max(Math.round(stackBlockSize / 5), 1);
        const segmentCount = Math.floor(
          (outerRadius - innerRadius) / (segmentLength + spacing),
        );
        for (let i = 0; i < segmentCount; i++) {
          const segmentInner =
            minRadius + segmentLength * i + spacing * (i - 1);
          const segmentOuter = segmentInner + segmentLength;
          drawRadialBar(
            segmentInner,
            segmentOuter,
            angle,
            angularWidth,
            color,
            "bar",
          );
        }
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(
          centerX + innerRadius * Math.cos(angle - angularWidth / 2),
          centerY + innerRadius * Math.sin(angle - angularWidth / 2),
        );
        ctx.arc(
          centerX,
          centerY,
          innerRadius,
          angle - angularWidth / 2,
          angle + angularWidth / 2,
          false,
        );
        ctx.lineTo(
          centerX + outerRadius * Math.cos(angle + angularWidth / 2),
          centerY + outerRadius * Math.sin(angle + angularWidth / 2),
        );
        ctx.arc(
          centerX,
          centerY,
          outerRadius,
          angle + angularWidth / 2,
          angle - angularWidth / 2,
          true,
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.fillStyle = color;

    const angleOffset = (origin / 180) * Math.PI;

    for (let i = 0; i < effectiveCount; i++) {
      const freqI = freqOrder === "desc" ? effectiveCount - 1 - i : i;
      const freqIndex = Math.floor((freqI / effectiveCount) * data.length);
      const amp = data[freqIndex]?.magnitude ?? 0;
      const theta = freqToTheta(i);
      const inner = minRadius;
      const outer = inner + Math.max(amp * (maxRadius - minRadius), 1);
      switch (mirror ?? "both") {
        case "none":
          drawRadialBar(
            inner,
            outer,
            theta + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          break;
        case "vert":
          drawRadialBar(
            inner,
            outer,
            theta / 2 + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          drawRadialBar(
            inner,
            outer,
            -theta / 2 + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          break;
        case "horiz":
          drawRadialBar(
            inner,
            outer,
            theta / 2 + Math.PI / 2 + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          drawRadialBar(
            inner,
            outer,
            -theta / 2 + Math.PI / 2 + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          break;
        case "both":
          drawRadialBar(
            inner,
            outer,
            theta / 4 + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          drawRadialBar(
            inner,
            outer,
            -theta / 4 + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          drawRadialBar(
            inner,
            outer,
            theta / 4 + Math.PI + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          drawRadialBar(
            inner,
            outer,
            -theta / 4 + Math.PI + angleOffset,
            angularWidth,
            color,
            barStyle,
          );
          break;
      }
    }
  });

  return <VisualizerCanvas canvasRef={canvasRef} />;
}

function Waveform({
  trim,
  smoothing: _smoothing,
  showWhenIdle,
}: {
  trim: FreqTrim;
  smoothing: number;
  showWhenIdle: boolean;
}) {
  const canvasRef = useStreamCanvas(trim, showWhenIdle, (ctx, canvas, data, color) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data) return;

    const points = data.map((_, i) => [
      (i / (data.length - 1)) * canvas.width,
      (data.reduce(
        (acc, d) =>
          acc +
          (d.magnitude *
            (Math.sin(
              ((d.freq_lo + d.freq_hi) / 2) *
                (i / data.length + Date.now() / 100),
            ) +
              1)) /
            2,
        0,
      ) /
        data.length) *
        canvas.height,
    ]);

    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      ctx.beginPath();
      ctx.moveTo(x0, canvas.height - y0);
      ctx.lineTo(x1, canvas.height - y1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  return <VisualizerCanvas canvasRef={canvasRef} />;
}
