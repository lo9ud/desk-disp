import { useEffect, useState } from "react";
import type { StreamName } from "../../ffi_types";
import type { StreamEvents } from "../events";
import { useWidgetApi } from "../context";

/**
 * Convenience wrapper over the imperative `api.streams.subscribe`
 */
export function useSubscription<T extends StreamName>(
  channelName: T,
): { data: StreamEvents[T] | null; loading: boolean } {
  const api = useWidgetApi();
  // Seeded from the hub's retained frame so a late mount renders immediately
  // instead of flashing empty for one interval. //TODO: switch to a suspended promise for a single-frame render?
  const [data, setData] = useState<StreamEvents[T] | null>(() =>
    api.streams.latest(channelName),
  );

  useEffect(() => {
    setData(api.streams.latest(channelName));
    return api.streams.subscribe(channelName, setData);
  }, [api, channelName]);

  return { data, loading: data === null };
}
