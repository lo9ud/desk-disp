import { createContext, useContext, useEffect, useMemo } from "react";
import { MockHub } from "./mockHub";

const StreamMockContext = createContext<MockHub | null>(null);

/** Non-null only inside a PreviewEnvironment; useSubscription reads this to
 *  decide between real IPC and mocked data. */
export function useStreamMock(): MockHub | null {
  return useContext(StreamMockContext);
}

/**
 * Wraps preview-only widget renders (rail gallery cards). Provides mocked
 * stream data; persistence is intercepted separately via the "preview:"
 * instance-id prefix (see previewPersistence.ts), since persistence hooks
 * resolve their scope from WidgetInstanceIdContext rather than from here.
 */
export function PreviewEnvironment({
  children,
}: {
  children: React.ReactNode;
}) {
  const hub = useMemo(() => new MockHub(), []);
  useEffect(() => () => hub.dispose(), [hub]);
  return (
    <StreamMockContext.Provider value={hub}>
      {children}
    </StreamMockContext.Provider>
  );
}
