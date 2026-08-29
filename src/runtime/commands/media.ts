import type { Transport } from "../transport";

/**
 * Playback control. Small and self-contained on purpose: this is the whole
 * object a media widget receives, so `MediaControlsWidget` holds three methods
 * rather than a handle to every command in the app.
 */
export interface MediaCommands {
  toggle(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
}

export function makeMediaCommands(t: Transport): MediaCommands {
  return {
    toggle: () => t.invoke<void>("toggle_playback"),
    next: () => t.invoke<void>("next_track"),
    previous: () => t.invoke<void>("prev_track"),
  };
}
