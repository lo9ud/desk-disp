import { useEffect } from "react";
import { useLatest } from "./useLatest";

export interface WindowEventOptions {
  /** Defaults to `window`. */
  target?: Window | Document;
  capture?: boolean;
  /** Skip wiring entirely while false. */
  enabled?: boolean;
}

/**
 * Subscribes to one or more events for as long as the component is mounted.
 * The handler is read through a ref, so an inline closure neither re-wires the
 * listener nor goes stale, and only the event names affect the subscription.
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
