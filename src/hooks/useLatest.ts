import { useRef, type RefObject } from "react";

/**
 * A ref that always holds the newest `value`, for effects and listeners that
 * need to read it without re-subscribing every time it changes.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
