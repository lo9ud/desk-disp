import { useEffect, useState } from "react";
import type { StreamName } from "../../ffi_types";
import type { StreamEvents } from "../events";
import { useWidgetApi } from "../context";

/**
 * Convenience wrapper over the imperative `api.streams.subscribe`, for widgets
 * that genuinely want a re-render per frame.
 *
 * It has no privileged path of its own — the primitive is the API, this is sugar
 * over it. A widget that draws to a canvas rather than to the DOM (the visualizer)
 * should subscribe imperatively instead, so frames don't travel through React
 * only to be ignored by it.
 *
 * The preview branch this used to carry is gone: a preview runtime is built with
 * a different `StreamSource`, so there is nothing here to switch on.
 */
export function useSubscription<T extends StreamName>(
  channelName: T,
): { data: StreamEvents[T] | null; loading: boolean } {
  const api = useWidgetApi();
  // Seeded from the hub's retained frame so a late mount renders immediately
  // instead of flashing empty for one interval.
  const [data, setData] = useState<StreamEvents[T] | null>(() =>
    api.streams.latest(channelName),
  );

  useEffect(() => {
    setData(api.streams.latest(channelName));
    return api.streams.subscribe(channelName, setData);
  }, [api, channelName]);

  return { data, loading: data === null };
}
