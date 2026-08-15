import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { LayoutFile, WidgetPlacement } from "../ffi_types";
import {
  canonicalRegistry,
  genWidgetId,
  InstanceRegistry,
} from "../registry/instanceRegistry";
import { ipc } from "../ipc";
import { GridDims, validateLayout } from "../utils/validation";
import { errorSeverity, WidgetError } from "../utils/widgetErrors";

interface EditModeContextValue {
  active: boolean;
  dirty: boolean;
  draftGridDims: GridDims;
  widgetErrors: WidgetError[];
  editRegistry: InstanceRegistry | null;
  enterEditMode: (opts?: { newLayout?: { id: string; name: string } }) => void;
  save: () => Promise<void>;
  cancel: () => void;
  moveWidget: (id: string, placement: WidgetPlacement) => void;
  updateWidgetSettings: (id: string, settings: Record<string, any>) => void;
  addWidget: (
    definitionId: string,
    placement: WidgetPlacement,
    settings?: Record<string, any>,
  ) => string | null;
  removeWidget: (id: string) => void;
  updateGridDims: (dims: Partial<GridDims>) => void;
  shiftWidgets: (
    colOffset: number,
    rowOffset: number,
    dimsDelta: Partial<GridDims>,
  ) => void;
}

const EditModeContext = createContext<EditModeContextValue | null>(null);

export function useEditMode(): EditModeContextValue {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error("useEditMode must be used inside EditModeProvider");
  return ctx;
}

interface EditModeProviderProps {
  children: React.ReactNode;
  activeLayoutId: string;
  gridDims: GridDims;
  buildLayout: (gridDims: GridDims) => LayoutFile;
  onGridDimsChange: (dims: GridDims) => void;
}

export function EditModeProvider({
  children,
  activeLayoutId,
  gridDims,
  buildLayout,
  onGridDimsChange,
}: EditModeProviderProps) {
  const [active, setActive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftGridDims, setDraftGridDims] = useState<GridDims>(gridDims);
  const [widgetErrors, setWidgetErrors] = useState<WidgetError[]>([]);
  const [editRegistryVersion, setEditRegistryVersion] = useState(0);
  const editRegistryRef = useRef<InstanceRegistry | null>(null);
  const preEditGridDims = useRef<GridDims>(gridDims);
  const pendingNewLayoutRef = useRef<{ id: string; name: string } | null>(null);

  const revalidate = useCallback((dims: GridDims) => {
    if (!editRegistryRef.current) return;
    setWidgetErrors(validateLayout(editRegistryRef.current.getAll(), dims));
  }, []);

  const enterEditMode = useCallback((opts?: { newLayout?: { id: string; name: string } }) => {
    preEditGridDims.current = gridDims;
    pendingNewLayoutRef.current = opts?.newLayout ?? null;
    editRegistryRef.current = opts?.newLayout ? new InstanceRegistry() : canonicalRegistry.clone();
    setDraftGridDims(gridDims);
    setWidgetErrors(validateLayout(editRegistryRef.current.getAll(), gridDims));
    setEditRegistryVersion((v) => v + 1);
    setDirty(false);
    setActive(true);
  }, [gridDims]);

  const moveWidget = useCallback((id: string, placement: WidgetPlacement) => {
    editRegistryRef.current?.updatePlacement(id, placement);
    setDirty(true);
    setDraftGridDims((dims) => { revalidate(dims); return dims; });
  }, [revalidate]);

  const updateWidgetSettings = useCallback((id: string, settings: Record<string, any>) => {
    editRegistryRef.current?.updateSettings(id, settings);
    setDirty(true);
    setDraftGridDims((dims) => { revalidate(dims); return dims; });
  }, [revalidate]);

  const addWidget = useCallback((
    definitionId: string,
    placement: WidgetPlacement,
    settings: Record<string, any> = {},
  ): string | null => {
    const inst = editRegistryRef.current?.add(
      genWidgetId(definitionId),
      definitionId,
      placement,
      settings,
    );
    setDirty(true);
    setDraftGridDims((dims) => { revalidate(dims); return dims; });
    return inst?.id ?? null;
  }, [revalidate]);

  const removeWidget = useCallback((id: string) => {
    const inst = editRegistryRef.current?.get(id);
    if (!inst) return;
    editRegistryRef.current!.remove(id);
    setDirty(true);
    setDraftGridDims((dims) => { revalidate(dims); return dims; });
  }, [revalidate]);

  const updateGridDims = useCallback((dims: Partial<GridDims>) => {
    setDirty(true);
    setDraftGridDims((prev) => {
      const next = { ...prev, ...dims };
      revalidate(next);
      return next;
    });
  }, [revalidate]);

  const shiftWidgets = useCallback((
    colOffset: number,
    rowOffset: number,
    dimsDelta: Partial<GridDims>,
  ) => {
    editRegistryRef.current?.shiftPlacements(colOffset, rowOffset);
    setDirty(true);
    setDraftGridDims((prev) => {
      const next = { ...prev, ...dimsDelta };
      revalidate(next);
      return next;
    });
  }, [revalidate]);

  const save = useCallback(async () => {
    if (!editRegistryRef.current) return;
    const errors = validateLayout(editRegistryRef.current.getAll(), draftGridDims);
    if (errors.some((e) => errorSeverity(e) === "error")) {
      throw new Error(`Layout has unresolved errors`);
    }
    canonicalRegistry.replaceWith(editRegistryRef.current);
    const layout = buildLayout(draftGridDims);
    const pending = pendingNewLayoutRef.current;
    const targetId = pending?.id ?? activeLayoutId;
    const targetLayout = pending ? { ...layout, id: targetId, name: pending.name } : layout;
    await ipc.saveLayout(targetId, targetLayout);
    if (pending) {
      await ipc.setActiveLayout(targetId);
      pendingNewLayoutRef.current = null;
    }
    onGridDimsChange(draftGridDims);
    editRegistryRef.current = null;
    setActive(false);
    setDirty(false);
    setWidgetErrors([]);
    setEditRegistryVersion((v) => v + 1);
  }, [draftGridDims, activeLayoutId, buildLayout, onGridDimsChange]);

  const cancel = useCallback(() => {
    pendingNewLayoutRef.current = null;
    editRegistryRef.current = null;
    setDraftGridDims(preEditGridDims.current);
    setWidgetErrors([]);
    setActive(false);
    setDirty(false);
    setEditRegistryVersion((v) => v + 1);
  }, []);

  const value: EditModeContextValue = useMemo(
    () => ({
      active,
      dirty,
      draftGridDims,
      widgetErrors,
      editRegistry: editRegistryRef.current,
      enterEditMode,
      save,
      cancel,
      moveWidget,
      updateWidgetSettings,
      addWidget,
      removeWidget,
      updateGridDims,
      shiftWidgets,
    }),
    // editRegistryVersion gates the editRegistry reference in/out of context
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      active,
      dirty,
      draftGridDims,
      widgetErrors,
      editRegistryVersion,
      enterEditMode,
      save,
      cancel,
      moveWidget,
      updateWidgetSettings,
      addWidget,
      removeWidget,
      updateGridDims,
      shiftWidgets,
    ],
  );

  return (
    <EditModeContext.Provider value={value}>
      {children}
    </EditModeContext.Provider>
  );
}
