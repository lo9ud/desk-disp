import { useEffect } from "react";
import { useLatest } from "./useLatest";

export interface WindowEventOptions {
  target?: Window | Document;
  capture?: boolean;
  enabled?: boolean;
}

/**
 * Subscribes to one or more events for as long as the component is mounted.
 */
export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K | K[],
  handler: (e: WindowEventMap[K]) => void,
  { target, capture = false, enabled = true }: WindowEventOptions = {},
): void {
  const saved = useLatest(handler);
  const names = (Array.isArray(type) ? type : [type]).join(" ");

  useEffect(() => {
    if (!enabled) return;
    const el = target ?? window;
    const listener = (e: Event) => saved.current(e as WindowEventMap[K]);
    const types = names.split(" ");
    types.forEach((t) => el.addEventListener(t, listener, capture));
    return () =>
      types.forEach((t) => el.removeEventListener(t, listener, capture));
  }, [names, target, capture, enabled, saved]);
}
