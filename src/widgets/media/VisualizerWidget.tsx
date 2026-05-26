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
          flip: {
            label: "Flip bars",
            type: "select",
            options: {
              none: "None",
              vert: "Vertically",
              horiz: "Horizontally",
              both: "Both",
            },
            default: "none",
          },
          mirror: {
            label: "Mirror bars",
            type: "select",
            options: {
              none: "None",
              vert: "Vertically",
              horiz: "Horizontally",
              both: "Both",
            },
            default: "none",
          },
          barStyle: {
            label: "Style",
            type: "select",
            options: {
              bar: "Bar",
              stack: "Stack",
            },
            default: "radial",
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
            showWhen: {
              key: "direction",
              is: "circular",
            },
          },
          origin: {
            label: "Origin",
            type: "select",
            options: {
              top: "Top",
              left: "Left",
              right: "Right",
              bottom: "Bottom",
            },
            default: "top",
            showWhen: {
              key: "direction",
              is: "circular",
            },
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
  flip,
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
          return (
            <VertBars
              frequencies={data}
              barCount={barCount}
              showWhenIdle={showWhenIdle}
              color={color}
              mirror={mirror}
              flip={flip}
              barStyle={barStyle}
            />
          );
        case "horizontal":
          return <div>Horizontal bars not implemented yet</div>;
        case "circular":
          return (
            <RadialBars
              innerRadius={innerRadius}
              frequencies={data}
              barCount={barCount}
              showWhenIdle={showWhenIdle}
              color={color}
              mirror={mirror}
              flip={flip}
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

function VertBars({
  frequencies,
  barCount,
  showWhenIdle,
  color,
  mirror,
  flip,
  barStyle,
}: {
  frequencies: FrequencyReading[] | null;
  barCount: number;
  showWhenIdle: boolean;
  color: string;
  mirror: string;
  flip: string;
  barStyle: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const q = 0.4;
  const b = 200;
  let data =
    frequencies?.map((d) => ({
      freq: Math.log(d.freq_hi + d.freq_lo),
      magnitude: Math.max(
        (Math.pow(b, (d.magnitude - q) / (1 - q)) - 1) / b,
        0.001,
      ),
    })) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const freqToX = (index: number) => {
      return (index / barCount) * canvas.width;
    };

    const ampToY = (amp: number) => {
      return canvas.height - amp * canvas.height;
    };

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

    ctx.fillStyle = color;

    for (let i = 0; i < barCount; i++) {
      const freqIndex = Math.floor((i / barCount) * data.length);
      const amp = data[freqIndex]?.magnitude ?? 0;
      let x = freqToX(i);
      let y = ampToY(amp);
      const barWidth = freqToX(i + 1) - x - 2;
      const barHeight = Math.max(canvas.height - y, 1);

      switch (mirror ?? "both") {
        case "none":
          drawBar(ctx, x, y, barWidth, barHeight, barStyle, color); // Just bar
          break;
        case "vert": // mirror vert
          switch (flip) {
            case "none": // mirror vert | no flip
              drawBar(ctx, x, 0, barWidth, barHeight / 2, barStyle, color); // Top half
              drawBar(
                ctx,
                x,
                canvas.height / 2 + y / 2,
                barWidth,
                barHeight / 2,
                barStyle,
                color,
              ); // Bottom half
              break;
            case "vert": // mirror vert | flip vert
              drawBar(ctx, x, y / 2, barWidth, barHeight, barStyle, color); // Center
              break;
            case "horiz": // mirror vert | flip horiz
              drawBar(
                ctx,
                canvas.width - x - barWidth,
                0,
                barWidth,
                barHeight / 2,
                barStyle,
                color,
              ); // Top half flipped
              drawBar(
                ctx,
                canvas.width - x - barWidth,
                canvas.height / 2 + y / 2,
                barWidth,
                barHeight / 2,
                barStyle,
                color,
              ); // Bottom half flipped
              break;
            case "both": // mirror vert | flip both
              drawBar(
                ctx,
                canvas.width - x - barWidth,
                y / 2,
                barWidth,
                barHeight,
                barStyle,
                color,
              ); // Center flipped
              break;
          }
          break;
        case "horiz": // mirror horiz
          switch (flip) {
            case "none": // mirror horiz | no flip
              drawBar(ctx, x / 2, y, barWidth / 2, barHeight, barStyle, color); // Left half
              drawBar(
                ctx,
                canvas.width - x / 2 - barWidth,
                y,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Right half
              break;
            case "vert": // mirror horiz | flip vert
              drawBar(ctx, x / 2, 0, barWidth / 2, barHeight, barStyle, color); // Left half
              drawBar(
                ctx,
                canvas.width - x / 2 - barWidth,
                0,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Right half
              break;
            case "horiz": // mirror horiz | flip horiz
              drawBar(
                ctx,
                canvas.width / 2 - x / 2,
                y,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Left half flipped
              drawBar(
                ctx,
                canvas.width / 2 + x / 2,
                y,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Right half flipped
              break;
            case "both": // mirror horiz | flip both
              drawBar(
                ctx,
                canvas.width / 2 - x / 2,
                0,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Left half flipped
              drawBar(
                ctx,
                canvas.width / 2 + x / 2,
                0,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Right half flipped
          }
          break;
        case "both":
          switch (flip) {
            case "none": // mirror both | no flip
              drawBar(
                ctx,
                x / 2,
                0,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Top-left
              drawBar(
                ctx,
                canvas.width - x / 2 - barWidth,
                0,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Top-right
              drawBar(
                ctx,
                x / 2,
                canvas.height - barHeight / 2,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Bottom-left
              drawBar(
                ctx,
                canvas.width - x / 2 - barWidth,
                canvas.height - barHeight / 2,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Bottom-right
              break;
            case "vert": // mirror both | flip vert
              drawBar(
                ctx,
                x / 2,
                y / 2,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Left half
              drawBar(
                ctx,
                canvas.width - x / 2 - barWidth,
                y / 2,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Right half
              break;
            case "horiz": // mirror both | flip horiz
              drawBar(
                ctx,
                canvas.width / 2 - x / 2,
                0,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Top-left flipped
              drawBar(
                ctx,
                canvas.width / 2 + x / 2,
                0,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Top-right flipped
              drawBar(
                ctx,
                canvas.width / 2 - x / 2,
                canvas.height - barHeight / 2,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Bottom-left flipped
              drawBar(
                ctx,
                canvas.width / 2 + x / 2,
                canvas.height - barHeight / 2,
                barWidth / 2,
                barHeight / 2,
                barStyle,
                color,
              ); // Bottom-right flipped
              break;
            case "both": // mirror both | flip both
              drawBar(
                ctx,
                canvas.width / 2 - x / 2,
                y / 2,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Left half flipped
              drawBar(
                ctx,
                canvas.width / 2 + x / 2,
                y / 2,
                barWidth / 2,
                barHeight,
                barStyle,
                color,
              ); // Right half flipped
          }
          break;
      }
    }
  }, [data, barCount, showWhenIdle, flip]);

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
  flip,
  barStyle,
  origin,
}: {
  frequencies: FrequencyReading[] | null;
  barCount: number;
  showWhenIdle: boolean;
  color: string;
  innerRadius: number;
  mirror: string;
  flip: string;
  barStyle: string;
  origin: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const q = 0.4;
  const b = 200;
  let data =
    frequencies?.map((d) => ({
      freq: Math.log(d.freq_hi + d.freq_lo),
      magnitude: Math.max(
        (Math.pow(b, (d.magnitude - q) / (1 - q)) - 1) / b,
        0.001,
      ),
    })) ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const freqToTheta = (index: number) => {
      return ((index + 0.5) / barCount) * 2 * Math.PI;
    };

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
    let angularWidth = 0;
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
        // ctx!.lineTo(
        //   centerX + innerRadius * Math.cos(angle + angularWidth / 2),
        //   centerY + innerRadius * Math.sin(angle + angularWidth / 2),
        // );
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
        // ctx!.lineTo(
        //   centerX + outerRadius * Math.cos(angle - angularWidth / 2),
        //   centerY + outerRadius * Math.sin(angle - angularWidth / 2),
        // );
        ctx!.closePath();
        ctx!.fill();
      }
    }

    ctx.fillStyle = color;

    let angleOffset = 0;
    switch (origin) {
      case "top":
        angleOffset = -Math.PI / 2;
        break;
      case "left":
        angleOffset = Math.PI;
        break;
      case "right":
        angleOffset = 0;
        break;
      case "bottom":
        angleOffset = Math.PI / 2;
        break;
    }

    for (let i = 0; i < barCount; i++) {
      const freqIndex = Math.floor((i / barCount) * data.length);
      const amp = data[freqIndex]?.magnitude ?? 0;
      let theta = freqToTheta(i);
      let inner = minRadius;
      let outer = inner + Math.max(amp * (maxRadius - minRadius), 1);
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
          angularWidth = ((2 * Math.PI) / barCount / 2) * density;
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
          angularWidth = ((2 * Math.PI) / barCount / 2) * density;
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
          angularWidth = ((2 * Math.PI) / barCount / 4) * density;
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
  }, [data, barCount, showWhenIdle]);

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
