import { useCallback, useEffect, useRef, useState } from "react";

export function useStat<
  Type,
  Output = Type,
  Getter extends (...args: any[]) => Promise<Type | null> = (
    ...args: any[]
  ) => Promise<Type | null>,
  Transform extends (v: Type | null) => Promise<Output> = (v: Type | null) => Promise<Output> 
>(
  getter: Getter,
  transform: Transform,
  args: Parameters<Getter>,
  refresh: number
): Output | null {
  const [value, setValue] = useState<Output | null>(null);

  const update = useCallback(async () => {
    getter(...args)
      .then(transform)
      .then((t) => setValue((old) => t ?? old));
  }, [getter, args, transform]);

  useEffect(() => {
    update();
    const interval = setInterval(update, refresh);
    return () => clearInterval(interval);
  }, [getter, refresh]);


  return value;
}

export function useSmoothed(latest: number | null, alpha: number = 4): number {
  const [prev, setPrev] = useState<number | null>(null);

  useEffect(() => {
    if (!prev) {
      setPrev(latest);
    } else {
      setPrev((p) => (latest ? p! + (latest - p!) / alpha : p));
    }
  }, [latest, alpha]);

  return prev ?? latest ?? 0;
}

export function useHistory<T>(value: T, length: number): T[] {
  const [history, setHistory] = useState<T[]>([value]);

  useEffect(() => {
    setHistory((h) => [...h, value].slice(-length, undefined));
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
