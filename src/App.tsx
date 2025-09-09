import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  useCpuUsage,
  useHistory,
  useMax,
  useMediaFrequencyData,
  useMediaMetadata,
  useMediaPosition,
  useMemoryUsage,
  useMin,
  useSmoothed,
  useWeather,
} from "./hooks";
import { DateTime } from "luxon";
import { convertBytes, translateWeatherCode } from "./utils";
import { registerables, Chart as ChartJS } from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(...registerables);

export default function App() {
  return (
    <main className="container">
      <Today />
      <Media />
      <Performance />
    </main>
  );
}

function Today() {
  const [now, setNow] = useState(DateTime.now());
  const weather = useWeather(51.5074, -0.1278, 15 * 60 * 1000); // London coords
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(DateTime.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="today">
      <div className="time">
        <span>
          {now.hour.toString().padStart(2, "0")}:
          {now.minute.toString().padStart(2, "0")}
          {now.hour < 12 ? " AM" : " PM"}
        </span>
      </div>
      <div className="divider"></div>
      <div className="date">
        <span>
          {now.weekdayLong}, {now.monthLong} {now.day}, {now.year}
        </span>
      </div>
      <div className="weather">
        <span>
          {weather?.current.temperature.toFixed(0)}°C{" "}
          {translateWeatherCode(weather?.current.weather_code || 100)}
        </span>
      </div>
    </div>
  );
}

function Media() {
  const metadata = useMediaMetadata(4000);
  const position = useMediaPosition(800);

  return (
    <div className="media-container">
      <div className="media-cover">
        <img
          src={"data:image/jpeg;base64," + metadata?.album_art}
          alt={metadata?.title}
          className="cover-image"
        />
      </div>
      <div className="media-title">{metadata?.title}</div>
      <div className="media-artist">{metadata?.artist}</div>
    </div>
  );
}

function Performance() {
  return (
    <div className="performance">
      <PerfBox title="CPU" refresh={100} hook={useCpuUsage} />
      {/* <PerfBox title="Memory" refresh={100} hook={useMemoryUsage} /> */}
      <FFT />
      <PerfBox title="GPU" refresh={100} hook={() => 0} />
      <PerfBox title="VRAM" refresh={100} hook={() => 0} />
    </div>
  );
}

function FFT() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frequencyData = useMediaFrequencyData(100);
  const max = useMax(frequencyData?.reduce((a, b) => Math.max(a, b), 0) || 0);
  const min = useMin(frequencyData?.reduce((a, b) => Math.min(a, b), 0) || 0);

  useEffect(() => {
    if (canvasRef.current && frequencyData) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / frequencyData.length;

      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(0, height);
      frequencyData.forEach((value, index) => {
        const barHeight = ((value - min) / (max - min)) * height;
        ctx.fillStyle = `rgb(${value}, ${255 - value}, 0)`;
        ctx.fillRect(
          index * barWidth,
          height - barHeight,
          barWidth - 1,
          barHeight
        );
        // ctx.lineTo(index * barWidth, height - barHeight);
      });
      ctx.stroke();
      ctx.fillText(`FFT: ${max} - ${min}`, 10, 20);
    }
  }, [frequencyData, min, max]);

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

  return (
    <div className="fft">
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

function PerfBox({
  title,
  refresh,
  hook,
}: Readonly<{
  title: string;
  refresh: number;
  hook: (refresh: number) => number | null;
}>) {
  const value = hook(refresh);
  const smoothed = useSmoothed(value || 0, 3);
  const history = useHistory(smoothed || 0, refresh / 2);

  return (
    <div className="perf-box">
      <div className="perf-box-title">{title}</div>
      <div className="perf-box-content">
        <Line
          datasetIdKey="id"
          data={{
            labels: history.map((_, i) => i),
            datasets: [
              {
                id: "1",
                data: history,
                borderColor: "black",
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 0,
              },
            ],
          }}
          options={{
            responsive: true,
            scales: {
              x: { display: false },
              y: {
                min: 0,
                max: 100,
                ticks: {
                  display: false,
                },
              },
            },
            plugins: {
              legend: {
                display: false,
                position: "top",
              },
            },
          }}
        />
      </div>
    </div>
  );
}
