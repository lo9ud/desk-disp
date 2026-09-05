import { useRef, type RefObject } from "react";


type LatestRef<T> = { current: T };

/**
 * A ref that always holds the newest `value`, for effects and listeners that
 * need to read it without re-subscribing every time it changes.
 */
export function useLatest<T>(value: T): LatestRef<T> {
  const ref = useRef(value);
  // eslint-disable-next-line react-hooks/refs -- this is a hook, but we don't want to re-render when the value changes
  ref.current = value;
  return ref;
}
