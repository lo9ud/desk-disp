import { useEffect, useMemo } from "react";
import { createAppRuntime } from "../runtime/AppRuntime";
import { systemClock, type Clock } from "../runtime/clock";
import { RuntimeProvider } from "../runtime/context";
import { memoryBackend } from "../runtime/persistence/memoryBackend";
import { MockStreamHub } from "../runtime/streams/MockStreamHub";
import { memoryTransport } from "../runtime/transport";

/**
 * Wraps preview-only widget renders (rail gallery cards) in their own runtime.
 *
 * This used to be two unrelated interception mechanisms — a React context that
 * `useSubscription` checked for mocked streams, and a `preview:` instance-id
 * prefix that every persistence handle branched on. Both are gone: preview is now
 * just a different set of constructor arguments, and nothing downstream knows or
 * asks.
 *
 * The transport has no Tauri behind it, so a preview render cannot reach the
 * backend even by accident — it can't perturb subscriber state, and an applet's
 * first-use fallback producer writes into memory instead of littering real
 * `w_preview:*` scope directories on disk.
 */
export function PreviewEnvironment({
  clock = systemClock,
  children,
}: {
  /** Inject a fixed or stepped clock to make every generated frame reproducible. */
  clock?: Clock;
  children: React.ReactNode;
}) {
  const runtime = useMemo(
    () =>
      createAppRuntime({
        transport: memoryTransport(),
        streams: () => new MockStreamHub(clock),
        persistenceBackend: memoryBackend(),
        clock,
        isPreview: true,
      }),
    [clock],
  );

  useEffect(() => () => runtime.dispose(), [runtime]);

  return <RuntimeProvider runtime={runtime}>{children}</RuntimeProvider>;
}
