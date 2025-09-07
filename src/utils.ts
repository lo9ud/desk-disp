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
  return Math.round(value / Math.pow(exp, i)) + " " + prefixes[i];
}

export const convertBytes = (value: number) =>
  convertUnits(value, ["B", "KB", "MB", "GB", "TB"], 1024);

export const convertHertz = (value: number) =>
  convertUnits(value, ["Hz", "KHz", "MHz", "GHz"], 1000);

export const convertPercentage = (value: number) =>
  clamp(0, Math.round(value * 100), 100) + " %";

async function invokeCommand<T>(
  command: string,
  ...args: any[]
): Promise<T | null> {
  return await invoke<T>(command, args)
    .then((r) => (console.log(`Invoked ${command}(${JSON.stringify(args)}): ${JSON.stringify(r)}`), r))
    .catch((e) => (console.log(`Invoked ${command}(${JSON.stringify(args)}): Error: ${JSON.stringify(e)}`), Promise.resolve(null)));
}

export function getMediaMetadata() {
  return invokeCommand<Metadata>("get_media_metadata");
}

export function getMediaPosition() {
  return invokeCommand<number>("get_media_position");
}

export function getMediaFrequencyData() {
  return invokeCommand<number[]>("get_media_frequency_data");
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

export function getGpuUsage() {
  return invokeCommand<number>("get_gpu_usage");
}

export function getVramUsage() {
  return invokeCommand<number>("get_vram_usage");
}

export function getMemoryUsage() {
  return invokeCommand<[number, number]>("get_memory_usage");
}

export function getDiskDetails() {
  return invokeCommand<DiskDetails[]>("get_disk_details");
}

export function getTemperatures() {
  return invokeCommand<Temperature[]>("get_temperatures");
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
  const latitude = response.latitude();
  const longitude = response.longitude();
  const elevation = response.elevation();
  const timezone = response.timezone();
  const timezoneAbbreviation = response.timezoneAbbreviation();
  const utcOffsetSeconds = response.utcOffsetSeconds();

  const current = response.current()!;
  const hourly = response.hourly()!;
  const daily = response.daily()!;

  // Define Int64 variables so they can be processed accordingly
  const sunrise = daily.variables(0)!;
  const sunset = daily.variables(1)!;

  // Note: The order of weather variables in the URL query and the indices below need to match!
  const raw = {
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

  return {
    timezone,
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
export function translateWeatherCode(code: number): string {
  switch (code) {
    // 0	Clear sky
    case 0:
    // 1, 2, 3	Mainly clear, partly cloudy, and overcast
    case 1:
      return "clear";
    case 2:
      return "cloudy";
    case 3:
      return "overcast";
    // 45, 48	Fog and depositing rime fog
    case 45:
    case 48:
      return "fog";
    // 51, 53, 55	Drizzle: Light, moderate, and dense intensity
    case 51:
      return "light drizzle";
    case 53:
    case 55:
    // 56, 57	Freezing Drizzle: Light and dense intensity
    case 56:
    case 57:
      return "drizzle";
    // 61, 63, 65	Rain: Slight, moderate and heavy intensity
    case 61:
      return "slight rain";
    case 63:
      return "moderate rain";
    case 65:
      return "heavy rain";
    // 66, 67	Freezing Rain: Light and heavy intensity
    case 66:
      return "light rain";
    case 67:
      return "heavy rain";
    // 71, 73, 75	Snow fall: Slight, moderate, and heavy intensity
    case 71:
      return "slight snow";
    case 73:
      return "moderate snow";
    case 75:
      return "heavy snow";
    // 77	Snow grains 
    case 77:
      return "snow";
    // 80, 81, 82	Rain showers: Slight, moderate, and violent
    case 80:
      return "slight showers";
    case 81:
      return "moderate showers";
    case 82:
      return "violent showers";
    // 85, 86	Snow showers slight and heavy
    case 85:
      return "slight snow";
    case 86:
      return "heavy snow";
    // 95 *	Thunderstorm: Slight or moderate
    case 95:
      return "thunderstorm";
    // 96, 99 *	Thunderstorm with slight and heavy hail
    case 96:
    case 99:
      return "thunderstorm";

    default:
      return "unknown (code " + code + ")";
  }
}