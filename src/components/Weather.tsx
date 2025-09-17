import { useStat } from "../hooks";
import {
  getWeather,
  pointsToSmoothPath,
  processWeather,
  roundDown,
  roundUp,
} from "../utils";
import { WidgetProps } from "./Widget";
import { Weather as WeatherType } from "../types";
import { DateTime } from "luxon";
import { useEffect, useRef, useState } from "react";
import { FaMoon as MoonIcon, FaSun as SunIcon } from "react-icons/fa6";
import styles from "./styles/Weather.module.css";
import { SiSunrise } from "react-icons/si";

export default function Weather({
  col,
  row,
  colSpan,
  rowSpan,
}: Readonly<WidgetProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observer = useRef<ResizeObserver>(
    new ResizeObserver((entries) =>
      entries.forEach((entry) => setDim(entry.contentRect))
    )
  );
  const [dim, setDim] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (containerRef.current) {
      observer.current.observe(containerRef.current);
    }
    return () => {
      if (containerRef.current) {
        observer.current.unobserve(containerRef.current);
      }
    };
  }, []);

  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };

  return (
    <div className={styles.weather} style={style}>
      <div ref={containerRef} className={styles.graphContainer}>
        {containerRef && <WeatherSVG width={dim.width} height={dim.height} />}
      </div>
    </div>
  );
}

function WeatherSVG({ width, height }: { width: number; height: number }) {
  const [now, setNow] = useState(DateTime.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(DateTime.now());
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  const weather = useStat<any, WeatherType>(
    getWeather,
    processWeather,
    [-33.927872, 18.868789],
    10 * 60 * 1000 // 10 minutes
  );
  if (!weather) return null;

  const { hourly, daily } = weather;

  const graphTimeStart = now.minus({ hours: 2 });
  const graphTimeEnd = now.plus({ hours: 30 });
  const graphTimeSpanMillis =
    graphTimeEnd.toMillis() - graphTimeStart.toMillis();

  const graphTempMin = roundDown(
    hourly
      .filter(
        (h) =>
          h.at > graphTimeStart.minus({ hours: 1 }) &&
          h.at < graphTimeEnd.plus({ hours: 1 })
      )
      .reduce((min, h) => Math.min(min, h.temp), 100),
    3
  );
  const graphTempMax =
    roundUp(
      hourly
        .filter(
          (h) =>
            h.at > graphTimeStart.minus({ hours: 1 }) &&
            h.at < graphTimeEnd.plus({ hours: 1 })
        )
        .reduce((max, h) => Math.max(max, h.temp), -100),
      3
    ) + 2;
  const graphTempSpan = graphTempMax - graphTempMin;

  const tempLines = [];
  for (let t = 5; t < graphTempMax; t += 5) {
    if (t > graphTempMin) tempLines.push(t);
  }

  const nDays = Math.ceil(
    graphTimeEnd.endOf("day").diff(graphTimeStart.startOf("day"), "days").days
  );

  const nights = Array.from({ length: nDays }, (_, i) =>
    graphTimeStart.startOf("day").plus({ days: i })
  );
  const noons = nights.map((d) => d.plus({ hours: 12 }));

  const sunsets = daily
    .filter(
      (d) => d.at > graphTimeStart && d.at < graphTimeEnd && d.type === "sunset"
    )
    .map((d) => d.at);
  const sunrises = daily
    .filter(
      (d) =>
        d.at > graphTimeStart && d.at < graphTimeEnd && d.type === "sunrise"
    )
    .map((d) => d.at);

  function scale(point: { x: DateTime }): number;
  function scale(point: { y: number }): number;
  function scale(point: { x: DateTime; y: number }): { x: number; y: number };
  function scale(point: {
    x?: DateTime;
    y?: number;
  }): number | { x: number; y: number } {
    const x = point.x
      ? ((point.x.toMillis() - graphTimeStart.toMillis()) /
          graphTimeSpanMillis) *
        graphWidth
      : null;
    const y = point.y
      ? graphHeight - ((point.y - graphTempMin) / graphTempSpan) * graphHeight
      : null;

    if (x === null) return y!;
    if (y === null) return x;
    return { x, y };
  }

  const graphHeight = height - 28;
  const graphWidth = width;
  const timeBarHeight = 18;
  const timeBarIconSize = timeBarHeight * 0.8;
  const timesHeight = height - graphHeight - timeBarHeight;

  function TimeMarker({
    t,
    icon: Icon,
  }: {
    t: DateTime;
    icon: React.ComponentType<{
      x: number;
      y: number;
      size: number;
      fill: string;
    }>;
  }): React.JSX.Element | null {
    const x = scale({ x: t });
    return (
      <>
        <Icon
          key={"noon-icon-" + t.toMillis()}
          x={x - timeBarIconSize / 2}
          y={graphHeight + (timeBarHeight - timeBarIconSize) / 2}
          size={timeBarIconSize}
          fill="#fffa"
        />
        <line
          key={"noon-line-" + x}
          x1={x}
          y1={15}
          x2={x}
          y2={graphHeight}
          stroke="#444"
          strokeWidth={1}
          strokeDasharray="2"
        />
        <text
          key={"noon-time-" + x}
          x={x}
          y={graphHeight + timeBarHeight + timesHeight}
          fill="#fff"
          fontSize={timesHeight}
          textAnchor="middle"
        >
          {t.toFormat("HH:mm")}
        </text>
      </>
    );
  }

  function TempLine({ t }: { t: number }): React.JSX.Element {
    const y = scale({ y: t });
    return (
      <>
        <line
          x1={0}
          y1={y}
          x2={width}
          y2={y}
          stroke="#444"
          strokeWidth={1}
          strokeDasharray="2"
        />
        <text x={width} y={y - 2} fill="#aaa" fontSize={10} textAnchor="end">
          {t}°C
        </text>
      </>
    );
  }

  const colourMap = [
    { temp: -20, color: "#0000ff" },
    { temp: 5, color: "#0461e4" },
    { temp: 15, color: "#a0e0ff" },
    { temp: 18, color: "#e6ffaa" },
    { temp: 26, color: "#dbe72f" },
    { temp: 32, color: "#ffaa00" },
    { temp: 40, color: "#ff5500" },
    { temp: 99, color: "#ff2600" },
  ];

  function tempToColor(t: number): string {
    for (let i = 1; i < colourMap.length; i++) {
      if (t < colourMap[i].temp) {
        return colourMap[i].color;
      }
    }
    return colourMap[colourMap.length - 1].color;
  }

  const graphPoints = hourly
    .filter(
      (h) =>
        h.at > graphTimeStart.minus({ hours: 1 }) &&
        h.at < graphTimeEnd.plus({ hours: 1 })
    )
    .map((h) => ({ ...scale({ x: h.at, y: h.temp }), ...h }));

  return (
    <svg
      width={width}
      height={height}
      className={styles.svg}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="timeBarGradient" x1="0" y1="0" x2="1" y2="0">
          {[
            ...noons.map((n) => ({ t: n, c: "rgba(255, 255, 255, 1)" })),
            ...nights.map((n) => ({ t: n, c: "rgba(0, 0, 0, 1)" })),
          ]
            .sort((a, b) => a.t.toMillis() - b.t.toMillis())
            .map(({ t, c }) => ({
              offset: scale({ x: t }) / graphWidth,
              color: c,
            }))
            .map(({ offset, color }) => (
              <stop key={offset + color} offset={offset} stopColor={color} />
            ))}
        </linearGradient>
        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
          {[5, 15, 18, 26, 32, 40]
            .map((t) => ({
              offset: scale({ y: t }) / graphHeight,
              color: tempToColor(t),
            }))
            .sort((a, b) => a.offset - b.offset)
            .map(({ offset, color }) => (
              <stop
                key={offset + color}
                offset={offset}
                stopColor={color + "2c"}
              />
            ))}
        </linearGradient>
        {/* <linearGradient id="tempGradient" x1="0" y1="0" x2="1" y2="0">
          {hourly.map(({ temp, at }, i) => <stop key={at.toMillis()} offset={scale({ x: at }) / graphWidth} stopColor={tempToColor(temp)} />)}
        </linearGradient> */}
      </defs>
      <rect
        x={0}
        y={graphHeight}
        width={graphWidth}
        height={timeBarHeight}
        fill="url(#timeBarGradient)"
        opacity={0.3}
      />
      {noons.map((n, index) => (
        <TimeMarker key={"noon-" + index} t={n} icon={SunIcon} />
      ))}
      {nights.map((n, index) => (
        <TimeMarker key={"midnight-" + index} t={n} icon={MoonIcon} />
      ))}
      {sunsets.map((s, index) => (
        <TimeMarker key={"sunset-" + index} t={s} icon={SiSunrise} />
      ))}
      {sunrises.map((s, index) => (
        <TimeMarker key={"sunrise-" + index} t={s} icon={SiSunrise} />
      ))}

      <path
        fill="url(#tempGradient)"
        stroke="#444"
        strokeWidth={2}
        d={pointsToSmoothPath([
          { x: scale({ x: graphTimeStart }), y: graphHeight },
          ...graphPoints,
          { x: scale({ x: graphTimeEnd }), y: graphHeight },
        ])}
        markerMid="url(#point)"
      />

      {tempLines.map((t, index) => (
        <TempLine key={"temp-" + index} t={t} />
      ))}
      <line
        x1={scale({ x: now })}
        y1={15}
        x2={scale({ x: now })}
        y2={graphHeight}
        stroke="#999"
        strokeWidth={1}
      />
      <text
        x={scale({ x: now })}
        y={10}
        fill="#fff"
        fontSize={10}
        textAnchor="middle"
      >
        Now
      </text>
      {graphPoints.map((p, index) => (
        <g key={"point-group-" + index} className={styles.pointGroup}>
          <circle
            key={"point-inner-" + index}
            data-temp={p.temp.toFixed(1)}
            cx={p.x}
            cy={p.y}
            className={styles.pointInner}
          />
          <circle
            key={"point-outer-" + index}
            cx={p.x}
            cy={p.y}
            className={styles.pointOuter}
          />
          <text x={p.x} y={p.y - 12} className={styles.pointLabel}>
            {p.at.toFormat("h:mm a")} - {p.temp.toFixed(1)}°
          </text>
        </g>
      ))}
    </svg>
  );
}
