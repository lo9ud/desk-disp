import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { FlagName, UiController } from "./UiController";

const UiContext = createContext<UiController | null>(null);

export function UiProvider({
  controller,
  children,
}: {
  controller: UiController;
  children: React.ReactNode;
}) {
  return <UiContext.Provider value={controller}>{children}</UiContext.Provider>;
}

export function useUiController(): UiController {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUiController must be used inside a UiProvider");
  return ui;
}

export interface LiveFlag {
  readonly value: boolean;
  /** The host's override, or null when the owner is in control. Read-only —
   *  only the controller itself can take one. */
  readonly override: boolean | null;
  /** Writes the intrinsic half; an active override still wins. */
  set(value: boolean): void;
}

/**
 * Reads a flag's resolved value. Pass `own` from the single component that
 * drives the intrinsic value, so a second driver is caught in dev.
 */
export function useUiFlag(name: FlagName, opts?: { own?: boolean }): LiveFlag {
  const ui = useUiController();
  const own = opts?.own ?? false;

  const subscribe = useCallback(
    (cb: () => void) => ui.subscribeFlag(name, cb),
    [ui, name],
  );
  // Two stores over one subscription: both snapshots are primitives, so neither
  // can tear, and an override taken without moving the resolved value still
  // reaches consumers that care about the distinction.
  const value = useSyncExternalStore(subscribe, () => ui.resolved(name));
  const override = useSyncExternalStore(subscribe, () => ui.overrideOf(name));
  const set = useCallback(
    (next: boolean) => ui.setIntrinsic(name, next),
    [ui, name],
  );

  const token = useRef<symbol | null>(null);
  token.current ??= Symbol(name);
  useEffect(() => {
    if (!own) return;
    return ui.claimFlag(name, token.current!);
  }, [ui, name, own]);

  return useMemo(() => ({ value, override, set }), [value, override, set]);
}
