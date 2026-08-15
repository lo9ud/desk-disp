import { useEffect, useRef, useState } from "react";
import type { BackendEvents, StreamName } from "../ipc";
import { ipcListen, subscribeChannel, unsubscribeChannel } from "../ipc";
import { useStreamMock } from "../preview/PreviewEnvironment";

export function useSubscription<T extends StreamName>(channelName: T): {
  data: BackendEvents[`stream::${T}`] | null;
  loading: boolean;
} {
  type D = BackendEvents[`stream::${T}`];
  const mock = useStreamMock();
  const [data, setData] = useState<D | null>(null);
  const [loading, setLoading] = useState(true);
  // Prevent double-subscribe in React strict mode double-effect
  const subscribed = useRef(false);

  useEffect(() => {
    if (subscribed.current) return;
    subscribed.current = true;

    // Preview renders never reach the backend: no subscribe_channel, so the
    // real stream loops stay untouched (and their subscriber counts honest).
    if (mock) {
      setData(mock.latest(channelName) as D);
      setLoading(false);
      const unsubscribe = mock.subscribe(channelName, (value) => {
        setData(value as D);
        setLoading(false);
      });
      return () => {
        subscribed.current = false;
        unsubscribe();
      };
    }

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    subscribeChannel(channelName).then(({ last_value, is_first_subscriber }) => {
      if (cancelled) return;
      if (last_value !== null && last_value !== undefined) {
        setData(last_value as D);
        setLoading(false);
      } else if (!is_first_subscriber) {
        setLoading(false);
      }
    });

    ipcListen(`stream::${channelName}` as keyof BackendEvents, (value) => {
      setData(value as D);
      setLoading(false);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      subscribed.current = false;
      unsubscribeChannel(channelName);
      unlisten?.();
    };
  }, [channelName, mock]);

  return { data, loading };
}
