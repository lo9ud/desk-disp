import React, { createContext, useCallback, useContext, useMemo } from "react";
import { LayoutFile } from "../ffi_types";
import { ipc } from "../ipc";
import { logger } from "../utils/logger";

const {error} = logger("persistence-context");

export interface PersistenceContextValue {
  activeLayoutId: string;
  saveLayout: () => Promise<void>;
}

const PersistenceContext = createContext<PersistenceContextValue | null>(null);

export function usePersistence(): PersistenceContextValue {
  const ctx = useContext(PersistenceContext);
  if (!ctx) throw new Error("usePersistence must be used inside PersistenceProvider");
  return ctx;
}

interface PersistenceProviderProps {
  activeLayoutId: string;
  /** Called to get the current layout state to persist. */
  getLayout: () => LayoutFile;
  children: React.ReactNode;
}

export function PersistenceProvider({
  activeLayoutId,
  getLayout,
  children,
}: PersistenceProviderProps) {
  const saveLayout = useCallback(async () => {
    const layout = getLayout();
    try {
      await ipc.saveLayout(activeLayoutId, layout);
    } catch (err) {
      error("Failed to save layout:", err?.toString());
    }
  }, [activeLayoutId, getLayout]);

  const value = useMemo(
    () => ({ activeLayoutId, saveLayout }),
    [activeLayoutId, saveLayout],
  );

  return (
    <PersistenceContext.Provider value={value}>
      {children}
    </PersistenceContext.Provider>
  );
}
