import { useEffect, useRef } from "react";
import { useSubscription } from "../../hooks";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";
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
              split: "Both edges",
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
            label: "Style",
            type: "select",
            options: {
              bar: "Bar",
              stack: "Stack",
            },
            default: "bar",
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
  innerRadius,
  origin,
  freqTrimBottom,
  freqTrimTop,
}: WidgetSettingsProps<typeof VISUALIZER_SETTINGS_DEF>) {
  const { data: dataRaw } = useSubscription("visualizer");
  const color = globalThis
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent")
    .trim();

  const data = dataRaw
    ? dataRaw.slice(
        Math.floor((dataRaw.length * freqTrimBottom) / 100),
        Math.ceil(dataRaw.length * (1 - freqTrimTop / 100)),
      )
    : null;

  switch (style) {
    case "bars":
      switch (direction) {
        case "vertical":
        case "horizontal":
          return (
            <BarsVisualizer
              frequencies={data}
              barCount={barCount}
              showWhenIdle={showWhenIdle}
              color={color}
              direction={direction}
              freqOrder={freqOrder}
              extentSource={extentSource}
              mirrorFreq={mirrorFreq}
              barStyle={barStyle}
            />
          );
        case "circular":
          return (
            <RadialBars
              innerRadius={innerRadius}
              frequencies={data}
              barCount={barCount}
              showWhenIdle={showWhenIdle}
              color={color}
              mirror={mirror}
              freqOrder={freqOrder}
              barStyle={barStyle}
              origin={origin}
            />
          );
      }
    // case "waveform":
    //   return (
    //     <Waveform
    //       data={frequencies}
    //       smoothing={smoothing}
    //       showWhenIdle={showWhenIdle}
    //     />
    //   );
    default:
      return null;
  }
}

const VisualizerWidget = registerWidget(Visualizer, {
  id: "visualizer",
  name: "Visualizer",
  description:
    "Shows a live animation that reacts to audio playing on your system",
  category: "media",
  tags: ["customizable"],
  settingsDef: VISUALIZER_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});

export default VisualizerWidget;

type Rect = { x: number; y: number; w: number; h: number };

function scaleValue(value: number, cutoff: number, scale: number) {
  // Roughly:
  // Values less than cutoff are aggressively reduced to near zero
  // Values greater than cutoff are exponentially scaled so that 1 maps to 1, and cutoff maps to a small value close to zero (e.g. 0.001)
  return Math.max((Math.pow(scale, (value - cutoff) / (1 - cutoff)) - 1) / (scale-1), 0.001);
}

function normalizeData(frequencies: FrequencyReading[] | null) {
  const cutoff = 0.4;
  const scale = Math.pow(2, 7.65); // = approx 200
  return (
    frequencies?.map((d) => ({
      freq: Math.log(d.freq_hi + d.freq_lo),
      magnitude: scaleValue(d.magnitude, cutoff, scale),
    })) ?? null
  );
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
  const w = Math.max(canvas.width / barCount - 2, 1);
  const fullH = Math.max(amp * canvas.height, 1);
  const halfH = Math.max(amp * canvas.height / 2, 1);
  switch (extentSource) {
    case "end":    return [{ x, y: 0, w, h: fullH }];
    case "center": return [{ x, y: canvas.height / 2 - fullH / 2, w, h: halfH }];
    case "split":  return [
      { x, y: canvas.height - halfH, w, h: halfH },
      { x, y: 0, w, h: halfH },
    ];
    default:       return [{ x, y: canvas.height - halfH, w, h: halfH }];
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
  const h = Math.max(canvas.height / barCount - 2, 1);
  const fullW = Math.max(amp * canvas.width, 1);
  const halfW = Math.max(amp * canvas.width / 2, 1);
  switch (extentSource) {
    case "end":    return [{ x: canvas.width - fullW, y, w: fullW, h }];
    case "center": return [{ x: canvas.width / 2 - fullW / 2, y, w: fullW, h }];
    case "split":  return [
      { x: 0, y, w: halfW, h },
      { x: canvas.width - halfW, y, w: halfW, h },
    ];
    default:       return [{ x: 0, y, w: fullW, h }];
  }
}

function applyMirrorFreq(rects: Rect[], cw: number, ch: number, direction: string): Rect[] {
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
  frequencies,
  barCount,
  showWhenIdle,
  color,
  direction,
  freqOrder,
  extentSource,
  mirrorFreq,
  barStyle,
}: {
  frequencies: FrequencyReading[] | null;
  barCount: number;
  showWhenIdle: boolean;
  color: string;
  direction: string;
  freqOrder: string;
  extentSource: string;
  mirrorFreq: boolean;
  barStyle: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = normalizeData(frequencies);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data || (data.every((d) => d.magnitude === 0) && !showWhenIdle)) {
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d1d5db";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No audio data", canvas.width / 2, canvas.height / 2);
      return;
    }

    const getBaseRects =
      direction === "vertical" ? verticalBaseRects : horizontalBaseRects;
    const effectiveCount = mirrorFreq ? Math.ceil(barCount / 2) : barCount;

    for (let i = 0; i < effectiveCount; i++) {
      const freqIndex = Math.floor((i / effectiveCount) * data.length);
      const amp = data[freqIndex]?.magnitude ?? 0;
      let rects = getBaseRects(i, amp, canvas, effectiveCount, freqOrder, extentSource);
      if (mirrorFreq) {
        rects = applyMirrorFreq(rects, canvas.width, canvas.height, direction);
      }
      for (const r of rects) {
        drawBar(ctx, r.x, r.y, r.w, r.h, barStyle, color);
      }
    }
  }, [data, barCount, showWhenIdle, direction, freqOrder, extentSource, mirrorFreq, barStyle, color]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.visualizer}
      width={canvasRef.current?.clientWidth}
      height={canvasRef.current?.clientHeight}
    />
  );
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: string,
  color: string,
) {
  switch (style) {
    case "bar":
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width, height);
      break;
    case "stack": {
      // Works badly, information on stack "source" (which edge the bar is growing from) is needed to add segemnts on the correct end of the bar
      // also likely to fail on e.g. centered bars where bars are growing from the middle outwards in both directions, whereas up/down bars should be independent
      const segmentHeight = 10;
      const spacing = 2;
      const segmentCount = Math.floor(height / (segmentHeight + spacing));
      for (let i = 0; i < segmentCount; i++) {
        const segmentY = y + segmentHeight * i + spacing * (i - 1);
        ctx.fillStyle = color;
        ctx.fillRect(x, segmentY, width, segmentHeight);
      }
      break;
    }
  }
}

function RadialBars({
  frequencies,
  barCount,
  showWhenIdle,
  color,
  innerRadius,
  mirror,
  freqOrder,
  barStyle,
  origin,
}: {
  frequencies: FrequencyReading[] | null;
  barCount: number;
  showWhenIdle: boolean;
  color: string;
  innerRadius: number;
  mirror: string;
  freqOrder: string;
  barStyle: string;
  origin: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = normalizeData(frequencies);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mirrorFactor = mirror === "both" ? 4 : mirror === "vert" || mirror === "horiz" ? 2 : 1;
    const effectiveCount = Math.ceil(barCount / mirrorFactor);
    const freqToTheta = (index: number) => ((index + 0.5) / effectiveCount) * 2 * Math.PI;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data || (data.every((d) => d.magnitude === 0) && !showWhenIdle)) {
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d1d5db";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No audio data", canvas.width / 2, canvas.height / 2);
      return;
    }

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
        const segmentLength = 8;
        const spacing = 2;
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
        ctx!.fillStyle = color;
        ctx!.beginPath();
        ctx!.moveTo(
          centerX + innerRadius * Math.cos(angle - angularWidth / 2),
          centerY + innerRadius * Math.sin(angle - angularWidth / 2),
        );
        ctx!.arc(
          centerX,
          centerY,
          innerRadius,
          angle - angularWidth / 2,
          angle + angularWidth / 2,
          false,
        );
        ctx!.lineTo(
          centerX + outerRadius * Math.cos(angle + angularWidth / 2),
          centerY + outerRadius * Math.sin(angle + angularWidth / 2),
        );
        ctx!.arc(
          centerX,
          centerY,
          outerRadius,
          angle + angularWidth / 2,
          angle - angularWidth / 2,
          true,
        );
        ctx!.closePath();
        ctx!.fill();
      }
    }

    ctx.fillStyle = color;

    const angleOffset = origin/180 * Math.PI;

    for (let i = 0; i < effectiveCount; i++) {
      const freqI = freqOrder === "desc" ? effectiveCount - 1 - i : i;
      const freqIndex = Math.floor((freqI / effectiveCount) * data.length);
      const amp = data[freqIndex]?.magnitude ?? 0;
      const theta = freqToTheta(i);
      const inner = minRadius;
      const outer = inner + Math.max(amp * (maxRadius - minRadius), 1);
      switch (mirror ?? "both") {
        case "none":
          drawRadialBar(inner, outer, theta + angleOffset, angularWidth, color, barStyle);
          break;
        case "vert":
          drawRadialBar(inner, outer, theta / 2 + angleOffset, angularWidth, color, barStyle);
          drawRadialBar(inner, outer, -theta / 2 + angleOffset, angularWidth, color, barStyle);
          break;
        case "horiz":
          drawRadialBar(inner, outer, theta / 2 + Math.PI / 2 + angleOffset, angularWidth, color, barStyle);
          drawRadialBar(inner, outer, -theta / 2 + Math.PI / 2 + angleOffset, angularWidth, color, barStyle);
          break;
        case "both":
          drawRadialBar(inner, outer, theta / 4 + angleOffset, angularWidth, color, barStyle);
          drawRadialBar(inner, outer, -theta / 4 + angleOffset, angularWidth, color, barStyle);
          drawRadialBar(inner, outer, theta / 4 + Math.PI + angleOffset, angularWidth, color, barStyle);
          drawRadialBar(inner, outer, -theta / 4 + Math.PI + angleOffset, angularWidth, color, barStyle);
          break;
      }
    }
  }, [data, barCount, showWhenIdle, freqOrder, mirror, innerRadius, origin, barStyle, color]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.visualizer}
      width={canvasRef.current?.clientWidth}
      height={canvasRef.current?.clientHeight}
    />
  );
}

function Waveform({
  data,
  smoothing,
  showWhenIdle,
}: {
  data: FrequencyReading[] | null;
  smoothing: number;
  showWhenIdle: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data || (data.every((d) => d.magnitude === 0) && !showWhenIdle)) {
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d1d5db";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No audio data", canvas.width / 2, canvas.height / 2);
    }
  }, [data, smoothing, showWhenIdle]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.visualizer}
      width={canvasRef.current?.clientWidth}
      height={canvasRef.current?.clientHeight}
    />
  );
}
