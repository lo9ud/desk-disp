import { useEffect, useMemo } from "react";
import { createAppRuntime } from "../runtime/AppRuntime";
import { systemClock, type Clock } from "../runtime/clock";
import { RuntimeProvider } from "../runtime/context";
import { memoryBackend } from "../runtime/persistence/memoryBackend";
import { MockStreamHub } from "../runtime/streams/MockStreamHub";
import { memoryTransport } from "../runtime/transport";

/**
 * Wraps preview-only widget renders (rail gallery cards) in their own runtime.
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
