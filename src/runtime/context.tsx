import { createContext, useContext } from "react";
import type { AppRuntime } from "./AppRuntime";
import type { WidgetApi } from "./WidgetApi";

const HostRuntimeContext = createContext<AppRuntime | null>(null);
const WidgetApiContext = createContext<WidgetApi | null>(null);

export function RuntimeProvider({
  runtime,
  children,
}: {
  runtime: AppRuntime;
  children: React.ReactNode;
}) {
  return (
    <HostRuntimeContext.Provider value={runtime}>
      {children}
    </HostRuntimeContext.Provider>
  );
}

/** Host-side access to the root. Not for widgets. */
export function useRuntime(): AppRuntime {
  const runtime = useContext(HostRuntimeContext);
  if (!runtime)
    throw new Error("useRuntime must be used inside a RuntimeProvider");
  return runtime;
}

export function WidgetApiProvider({
  api,
  children,
}: {
  api: WidgetApi;
  children: React.ReactNode;
}) {
  return (
    <WidgetApiContext.Provider value={api}>{children}</WidgetApiContext.Provider>
  );
}

/**
 * Fails closed: a widget rendered outside a scope throws at first access rather
 * than quietly resolving to something more privileged.
 */
export function useWidgetApi(): WidgetApi {
  const api = useContext(WidgetApiContext);
  if (!api)
    throw new Error(
      "useWidgetApi: this component is rendered outside a widget scope. " +
        "Widget data hooks are only usable inside a widget mounted by RenderWidget.",
    );
  return api;
}
