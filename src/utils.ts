import { invoke } from "@tauri-apps/api/core";
import { fetchWeatherApi } from "openmeteo";
import { DateTime } from "luxon";

import type {
  Metadata,
  Processors,
  GpuDetails,
  DiskDetails,
  Temperature,
  Weather,
  FrequencyReading,
  NetworkInterface,
  Config,
} from "./types";

function clamp(min: number, value: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

function convertUnits(value: number, prefixes: string[], exp: number): string {
  if (value === 0) return `0 ${prefixes[0]}`;
  const i = clamp(
    0,
    Math.floor(Math.log(value) / Math.log(exp)),
    prefixes.length - 1
  );
  return (value / Math.pow(exp, i)).toFixed(2) + " " + prefixes[i];
}

export const convertBytes = (value: number) =>
  convertUnits(value, ["B", "KB", "MB", "GB", "TB"], 1024);

export const convertHertz = (value: number) =>
  convertUnits(value, ["Hz", "KHz", "MHz", "GHz"], 1000);

export const convertPercentage = (value: number) =>
  clamp(0, Math.round(value * 100), 100) + " %";

async function invokeCommand<T>(
  command: string,
  log: boolean = false,
  args: Record<string, unknown> = {}
): Promise<T | null> {
  return await invoke<T>(command, args)
    .then((r) =>
      log
        ? (console.log(
            `Invoked ${command}(${JSON.stringify(args)}): ${JSON.stringify(r)}`
          ),
          r)
        : r
    )
    .catch(
      (e) => (
        console.log(
          `Invoked ${command}(${JSON.stringify(args)}): Error: ${JSON.stringify(
            e
          )}`
        ),
        Promise.resolve(null)
      )
    );
}

export function getConfigPath() {
  return invokeCommand<string>("get_config_path", true).then((path) => {
    if (!path) {
      throw new Error("Failed to get config path");
    }
    return path;
  });
}

export function getConfig() {
  return invokeCommand<Config>("get_config", true).then((cfg) => {
    if (!cfg) {
      throw new Error("Failed to load config");
    }
    return cfg;
  });
}

export function getMediaMetadata() {
  return invokeCommand<Metadata>("get_media_metadata");
}

export function getAlbumArtHiRes(trackName: string, artistName: string) {
  return invokeCommand<string>("get_high_res_album_art", false, {
    track_name: trackName,
    artist_name: artistName,
  });
}

export function getMediaPosition() {
  return invokeCommand<number>("get_media_position");
}

export function getMediaFrequencyData() {
  return invokeCommand<FrequencyReading[]>("get_media_frequency_data");
}

export function getCpuDetails() {
  return invokeCommand<Processors>("get_processors");
}

export function getCpuUsage() {
  return invokeCommand<number>("get_cpu_usage");
}

export function getGpuDetails() {
  return invokeCommand<GpuDetails[]>("get_gpu_details");
}

export function getMemoryUsage() {
  return invokeCommand<[number, number]>("get_memory_usage");
}

export function getSwapUsage() {
  return invokeCommand<[number, number]>("get_swap_usage");
}

export function getDiskDetails() {
  return invokeCommand<DiskDetails[]>("get_disk_details");
}

export function getDisk(mount: string) {
  return getDiskDetails().then((disks) =>
    disks
      ? disks.find((d) =>
          d.mount_point.toLowerCase().includes(mount.toLowerCase())
        ) ?? null
      : null
  );
}

export function getTemperatures() {
  return invokeCommand<Temperature[]>("get_temperatures");
}

export function getNetworkInterfaces() {
  return invokeCommand<NetworkInterface[]>("get_network_interfaces");
}

export async function getWeather(lat: number, lon: number) {
  const params = {
    latitude: lat,
    longitude: lon,
    daily: ["sunrise", "sunset"],
    hourly: "temperature_2m",
    current: ["temperature_2m", "weather_code"],
    timezone: "auto",
    past_days: 1,
    forecast_days: 3,
  };
  const url = "https://api.open-meteo.com/v1/forecast";
  const responses = await fetchWeatherApi(url, params);

  // Process first location. Add a for-loop for multiple locations or weather models
  const response = responses[0];

  // Attributes for timezone and location
  const timezone = response.timezone();

  const current = response.current()!;
  const hourly = response.hourly()!;
  const daily = response.daily()!;

  // Define Int64 variables so they can be processed accordingly
  const sunrise = daily.variables(0)!;
  const sunset = daily.variables(1)!;

  // Note: The order of weather variables in the URL query and the indices below need to match!
  return {
    timezone: timezone!,
    current: {
      time: DateTime.fromSeconds(Number(current.time())).setZone(timezone!),
      temperature_2m: current.variables(0)!.value(),
      weather_code: current.variables(1)!.value(),
    },
    hourly: {
      time: [
        ...Array(
          (Number(hourly.timeEnd()) - Number(hourly.time())) / hourly.interval()
        ),
      ].map((_, i) =>
        DateTime.fromSeconds(Number(hourly.time()))
          .setZone(timezone!)
          .plus({ hours: i })
      ),
      temperature_2m: hourly.variables(0)!.valuesArray(),
    },
    daily: {
      time: [
        ...Array(
          (Number(daily.timeEnd()) - Number(daily.time())) / daily.interval()
        ),
      ].map((_, i) =>
        DateTime.fromSeconds(Number(daily.time()))
          .setZone(timezone!)
          .plus({ days: i })
      ),
      // Map Int64 values to according structure
      sunrise: [...Array(sunrise.valuesInt64Length())].map((_, i) =>
        DateTime.fromSeconds(Number(sunrise.valuesInt64(i))).setZone(timezone!)
      ),
      // Map Int64 values to according structure
      sunset: [...Array(sunset.valuesInt64Length())].map((_, i) =>
        DateTime.fromSeconds(Number(sunset.valuesInt64(i))).setZone(timezone!)
      ),
    },
  };
}
export async function processWeather(
  raw_data: ReturnType<typeof getWeather>
): Promise<Weather> {
  let raw = await raw_data;
  return {
    timezone: raw.timezone,
    current: {
      time: raw.current.time,
      temperature: raw.current.temperature_2m,
      weather_code: raw.current.weather_code,
    },
    daily: Array.from(raw.daily.time)
      .flatMap((_, i) => [
        { type: "sunset", at: raw.daily.sunset[i] },
        { type: "sunrise", at: raw.daily.sunrise[i] },
      ])
      .sort((a, b) => a.at.valueOf() - b.at.valueOf()),
    hourly: Array.from(raw.hourly.time).map((time, i) => ({
      temp: raw.hourly.temperature_2m![i],
      at: time,
    })),
  } as Weather;
}
import {
  FaSun,
  FaCloud,
  FaCloudRain,
  FaCloudShowersHeavy,
  FaCloudBolt,
  FaSmog,
  FaSnowflake,
  FaCloudSun,
  FaCloudSunRain,
  FaQuestion,
} from "react-icons/fa6";
export function translateWeatherCode(
  code: number
): [string, React.ComponentType<{style?: React.CSSProperties; className?: string}>] {
  switch (code) {
    // 0	Clear sky
    case 0:
    // 1, 2, 3	Mainly clear, partly cloudy, and overcast
    case 1:
      return ["clear", FaSun];
    case 2:
      return ["partly cloudy", FaCloudSun];
    case 3:
      return ["overcast", FaCloud];
    // 45, 48	Fog and depositing rime fog
    case 45:
    case 48:
      return ["fog", FaSmog];
    // 51, 53, 55	Drizzle: Light, moderate, and dense intensity
    case 51:
      return ["light drizzle", FaCloudSunRain];
    case 53:
    case 55:
    // 56, 57	Freezing Drizzle: Light and dense intensity
    case 56:
    case 57:
      return ["drizzle", FaCloudRain];
    // 61, 63, 65	Rain: Slight, moderate and heavy intensity
    case 61:
      return ["slight rain", FaCloudSunRain];
    case 63:
      return ["moderate rain", FaCloudRain];
    case 65:
      return ["heavy rain", FaCloudRain];
    // 66, 67	Freezing Rain: Light and heavy intensity
    case 66:
      return ["light rain", FaCloudRain];
    case 67:
      return ["heavy rain", FaCloudRain];
    // 71, 73, 75	Snow fall: Slight, moderate, and heavy intensity
    case 71:
      return ["slight snow", FaSnowflake];
    case 73:
      return ["moderate snow", FaSnowflake];
    case 75:
      return ["heavy snow", FaSnowflake];
    // 77	Snow grains
    case 77:
      return ["snow", FaSnowflake];
    // 80, 81, 82	Rain showers: Slight, moderate, and violent
    case 80:
      return ["slight showers", FaCloudShowersHeavy];
    case 81:
      return ["moderate showers", FaCloudShowersHeavy];
    case 82:
      return ["violent showers", FaCloudShowersHeavy];
    // 85, 86	Snow showers slight and heavy
    case 85:
      return ["slight snow", FaSnowflake];
    case 86:
      return ["heavy snow", FaSnowflake];
    // 95 *	Thunderstorm: Slight or moderate
    case 95:
      return ["thunderstorm", FaCloudBolt];
    // 96, 99 *	Thunderstorm with slight and heavy hail
    case 96:
    case 99:
      return ["thunderstorm", FaCloudBolt];

    default:
      return ["unknown (code " + code + ")", FaQuestion];
  }
}

export function range(n: number): number[] {
  return [...Array(n).keys()].map((i) => i / n);
}

type Point = { x: number; y: number };

export function pointsToSmoothPath(
  points: Point[],
  tension: number = 0.35
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  function getControlPoints(
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point
  ): [Point, Point] {
    const d01 = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
    const d12 = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const d23 = Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);
    
    const fa = (tension * d01) / (d01 + d12);
    const fb = (tension * d12) / (d12 + d23);

    const cp1 = {
      x: p1.x - fa * (p0.x - p2.x),
      y: p1.y - fa * (p0.y - p2.y),
    };

    const cp2 = {
      x: p2.x + fb * (p1.x - p3.x),
      y: p2.y + fb * (p1.y - p3.y),
    };
    
    return [cp1, cp2];
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  if (points.length > 2) {
    const [, cp2] = getControlPoints(
      points[0],
      points[0],
      points[1],
      points[2]
    );
    path += ` Q ${cp2.x} ${cp2.y} ${points[1].x} ${points[1].y}`;
  }

  for (let i = 1; i < points.length - 2; i++) {
    const [cp1, cp2] = getControlPoints(
      i > 0 ? points[i - 1] : points[0],
      points[i],
      points[i + 1],
      i < points.length - 2 ? points[i + 2] : points[points.length - 1]
    );

    path += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${points[i + 1].x} ${
      points[i + 1].y
    }`;
  }

  if (points.length > 2) {
    const [cp1] = getControlPoints(
      points[points.length - 3],
      points[points.length - 2],
      points[points.length - 1],
      points[points.length - 1]
    );
    path += ` Q ${cp1.x} ${cp1.y} ${points[points.length - 1].x} ${
      points[points.length - 1].y
    }`;
  }

  return path;
}

export function roundTo(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

export function roundDown(value: number, nearest: number): number {
  return Math.floor(value / nearest) * nearest;
}

export function roundUp(value: number, nearest: number): number {
  return Math.ceil(value / nearest) * nearest;
}
export function lerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number];
export function lerp(a: number, b: number, t: number): number;
export function lerp(a: any, b: any, t: number): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }
  return a + (b - a) * t;
}