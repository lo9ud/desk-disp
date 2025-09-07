import { useEffect, useState } from "react";
import {
  getCpuDetails,
  getCpuUsage,
  getDiskDetails,
  getGpuDetails,
  getGpuUsage,
  getMediaFrequencyData,
  getMediaMetadata,
  getMediaPosition,
  getMemoryUsage,
  getTemperatures,
  getVramUsage,
  getWeather,
} from "./utils";
import type {
  Metadata,
  Processors,
  GpuDetails,
  DiskDetails,
  Temperature,
  Weather,
} from "./types";
export function useStat<T>(
  getter: () => Promise<T | null>,
  refresh: number
): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      getter().then((v) => setValue((old) => v ?? old));
    }, refresh);
    void (async () => setValue(await getter()))();

    return () => clearInterval(interval);
  }, [getter, refresh]);

  return value;
}

export const useMediaMetadata = (refresh: number) =>
  useStat<Metadata>(getMediaMetadata, refresh);

export const useMediaPosition = (refresh: number) =>
  useStat<number>(getMediaPosition, refresh);

export const useMediaFrequencyData = (refresh: number) =>
  useStat<number[]>(getMediaFrequencyData, refresh);

export const useCpuDetails = (refresh: number) =>
  useStat<Processors>(getCpuDetails, refresh);

export const useCpuUsage = (refresh: number) =>
  useStat<number>(getCpuUsage, refresh);

export const useGpuDetails = (refresh: number) =>
  useStat<GpuDetails[]>(getGpuDetails, refresh);

export const useGpuUsage = (refresh: number) =>
  useStat<number>(getGpuUsage, refresh);

export const useVramUsage = (refresh: number) =>
  useStat<number>(getVramUsage, refresh);

export const useMemoryUsage = (refresh: number) =>
  useStat<number>(
    () => getMemoryUsage().then((mem) => mem && (mem[0] / mem[1]) * 100),
    refresh
  );

export const useMemory = (refresh: number) =>
  useStat<[number, number]>(getMemoryUsage, refresh);

export const useDiskDetails = (refresh: number) =>
  useStat<DiskDetails[]>(getDiskDetails, refresh);

export const useTemperatures = (refresh: number) =>
  useStat<Temperature[]>(getTemperatures, refresh);

export const useWeather = (lat: number, lon: number, refresh: number) =>
  useStat<Weather>(() => getWeather(lat, lon), refresh);

export function useSmoothed(latest: number, alpha: number = 4): number {
  const [prev, setPrev] = useState<number>(0);

  useEffect(() => {
    setPrev((p) => p + (latest - p) / alpha);
  }, [latest, alpha]);

  return prev;
}

export function useHistory(value: number, length: number): number[] {
  const [history, setHistory] = useState<number[]>(Array(length).fill(0));

  useEffect(() => {
    setHistory((h) => [value, ...h].slice(0, length));
  }, [value, length]);

  return history;
}

export function useMax(v: number) {
  const [max, setMax] = useState<number>(v);
  useEffect(() => {
    if (v > max) setMax(v);
  }, [v, max]);
  return max;
}

export function useMin(v: number) {
  const [min, setMin] = useState<number>(v);
  useEffect(() => {
    if (v < min) setMin(v);
  }, [v, min]);
  return min;
}
