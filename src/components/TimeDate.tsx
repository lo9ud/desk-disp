import { useEffect, useState } from "react";
import styles from "./styles/TimeDate.module.css";
import { WidgetProps } from "./Widget";
import { getWeather, processWeather, translateWeatherCode } from "../utils";
import { Weather } from "../types";
import { useStat } from "../hooks";

export default function TimeDate({
  col,
  row,
  colSpan,
  rowSpan,
}: Readonly<WidgetProps>) {
  const [now, setNow] = useState(new Date());
  const weather = useStat<any, Weather>(
    getWeather,
    processWeather,
    [-33.927872, 18.868789],
    60000
  );

  const temp = weather?.current.temperature;
  const weatherCode = weather?.current.weather_code;

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const dateString = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeString = now
    .toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toLocaleUpperCase();

  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };

  const tempStr = temp?.toFixed(0);
  let [condition, Icon] = translateWeatherCode(weatherCode ?? 0);
  condition = condition.charAt(0).toUpperCase() + condition.slice(1);

  return (
    <div className={styles.timeDate} style={style}>
      <div className={styles.time}>
        <span>{timeString}</span>
      </div>
      <div className={styles.divider} />
      <div className={styles.date}>
        <span>{dateString}</span>
      </div>
      <div className={styles.weather}>
        <Icon className={styles.icon} />
        <span>
          {condition}, {tempStr}°C
        </span>
      </div>
    </div>
  );
}
