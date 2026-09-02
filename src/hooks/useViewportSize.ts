import { useState } from "react";
import type { Size } from "../utils/placement";
import { useWindowEvent } from "./useWindowEvent";

/** The window's inner size, kept current across resizes. */
export function useViewportSize(): Size {
  const [size, setSize] = useState<Size>(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useWindowEvent("resize", () =>
    setSize({ w: window.innerWidth, h: window.innerHeight }),
  );

  return size;
}
