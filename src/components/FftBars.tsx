import { useEffect, useRef } from "react";
import { FrequencyReading } from "../types";

function makeSineWave(array: number[]) {
  const len = array.length;

  const padding = 0.2;

  const freq_hi = 7;
  const speed_hi = 2;
  const freq_mid = 4;
  const speed_mid = 1;
  const freq_lo = 2;
  const speed_lo = -1;

  const hi = (i:number, t:number) => Math.sin((i / len) * Math.PI * freq_hi + t * speed_hi);
  const mid = (i:number, t:number) => Math.sin((i / len) * Math.PI * freq_mid + t * speed_mid);
  const lo = (i:number, t:number) => Math.sin((i / len) * Math.PI * freq_lo + t * speed_lo);
  const t = Date.now() / 1000;

  return array.map((_, i) => ((hi(i, t) + mid(i, t) + lo(i, t)) / 3 * 0.5 + 0.5) * (1 - padding * 2) + padding);
}


export default function FftBars({
  data: frequencyData,
}: Readonly<{
  data: FrequencyReading[] | null;
}>) {
  const firstZero = useRef<Date | null>(null);
  const old = useRef<number[] | null>(null);
  const max = useRef<number[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && frequencyData) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const floor = 0.6;

      let magnitudes: number[] = frequencyData.map((f) => {
        return Math.max(
          Math.pow((f.magnitude - floor) / (1 - floor), 3),
          0.04
        );
      });
      
      if (frequencyData.every((f) => f.magnitude <= 0.01)) {
        if (!firstZero.current) {
          firstZero.current = new Date();
        } else if (Date.now() - firstZero.current.getTime() > 2000) {
          magnitudes = makeSineWave(magnitudes);
        }
      } else {
        firstZero.current = null;
      }

      const barDensity = 0.4;

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / frequencyData.length;
      const barSpacing = barWidth * (1 - barDensity);

      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(0, height);

      if (!max.current) {
        max.current = magnitudes;
      } else {
        max.current = max.current.map((m, i) =>
          Math.max(m * 0.98, magnitudes[i])
        );
      }

      ctx.strokeStyle = "white";
      ctx.lineWidth = 0.3;
      magnitudes.forEach((reading, index) => {
        const barHeight = reading * height;
        ctx.fillStyle = "#414040ff";
        ctx.fillRect(
          index * barWidth + barSpacing / 2,
          height - barHeight,
          barWidth - barSpacing,
          barHeight
        );
        ctx.fillStyle = "white";
        ctx.fillRect(
          index * barWidth + barSpacing / 2,
          height - barHeight,
          barWidth - barSpacing,
          3
        );
      });

      // ctx.fillStyle = "white";
      // if (max.current !== null) {
      //   max.current.forEach((reading, index) => {
      //     const barHeight = reading * height;
      //     ctx.lineWidth = 0.3;
      //     ctx.fillRect(
      //       index * barWidth + barSpacing / 2,
      //       height - barHeight,
      //       barWidth - barSpacing,
      //       barWidth-barSpacing
      //     );
      //     ctx.moveTo(index * barWidth + barWidth / 2, height - barHeight + 4);
      //     ctx.lineTo(
      //       index * barWidth + barWidth / 2,
      //       height - magnitudes[index] * height
      //     );
      //   });
      // }
      ctx.stroke();
      old.current = frequencyData.map((f) => f.magnitude);
    }
  }, [frequencyData]);

  useEffect(() => {
    const scale = () => {
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
    };
    if (canvasRef.current) {
      scale();
      window.addEventListener("resize", scale);
      return () => window.removeEventListener("resize", scale);
    }
  }, []);

  return <canvas ref={canvasRef}></canvas>;
}
