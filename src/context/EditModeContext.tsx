import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LayoutFile, WidgetPlacement } from "../ffi_types";
import { genWidgetId, InstanceRegistry } from "../registry/instanceRegistry";
import { useRuntime } from "../runtime/context";
import { useUiController } from "../ui/context";
import { logger } from "../utils/logger";
import { GridDims, validateLayout } from "../utils/validation";
import { errorSeverity, WidgetError } from "../utils/widgetErrors";

const { warn } = logger("edit-mode");

interface EditModeContextValue {
  active: boolean;
  dirty: boolean;
  draftGridDims: GridDims;
  widgetErrors: WidgetError[];
  editRegistry: InstanceRegistry | null;
  enterEditMode: (opts?: {
    newLayout?: { id: string; name: string };
    /** Start from a prepared registry instead of cloning the live one. A tour
     *  hands in its own; nothing reaches disk unless save() runs. */
    draft?: InstanceRegistry;
  }) => void;
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
  const runtime = useRuntime();
  const ui = useUiController();
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

  const enterEditMode = useCallback((opts?: {
    newLayout?: { id: string; name: string };
    draft?: InstanceRegistry;
  }) => {
    // Always the live dims, never a caller's: cancel() restores this, so taking
    // an injected value here would write a tour's grid back over the real one.
    preEditGridDims.current = gridDims;
    pendingNewLayoutRef.current = opts?.newLayout ?? null;
    editRegistryRef.current =
      opts?.draft ??
      (opts?.newLayout ? new InstanceRegistry() : runtime.instances.clone());
    setDraftGridDims(gridDims);
    setWidgetErrors(validateLayout(editRegistryRef.current.getAll(), gridDims));
    setEditRegistryVersion((v) => v + 1);
    setDirty(false);
    setActive(true);
  }, [runtime, gridDims]);

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
    // Not a guard - the save affordance is suppressed and the tour has no way to
    // call this. If it ever fires, one of those two has a hole in it.
    if (ui.resolved("tourActive")) {
      warn("save() reached while a tour chapter owns the edit session");
    }
    const errors = validateLayout(editRegistryRef.current.getAll(), draftGridDims);
    if (errors.some((e) => errorSeverity(e) === "error")) {
      throw new Error(`Layout has unresolved errors`);
    }
    runtime.instances.replaceWith(editRegistryRef.current);
    const layout = buildLayout(draftGridDims);
    const pending = pendingNewLayoutRef.current;
    const targetId = pending?.id ?? activeLayoutId;
    const targetLayout = pending ? { ...layout, id: targetId, name: pending.name } : layout;
    await runtime.layouts.save(targetId, targetLayout);
    if (pending) {
      await runtime.layouts.setActive(targetId);
      pendingNewLayoutRef.current = null;
    }
    onGridDimsChange(draftGridDims);
    editRegistryRef.current = null;
    setActive(false);
    setDirty(false);
    setWidgetErrors([]);
    setEditRegistryVersion((v) => v + 1);
  }, [runtime, ui, draftGridDims, activeLayoutId, buildLayout, onGridDimsChange]);

  const cancel = useCallback(() => {
    pendingNewLayoutRef.current = null;
    editRegistryRef.current = null;
    setDraftGridDims(preEditGridDims.current);
    setWidgetErrors([]);
    setActive(false);
    setDirty(false);
    setEditRegistryVersion((v) => v + 1);
  }, []);

  // Stable handle reading a live ref, so registration doesn't churn as this
  // provider re-renders and the controller never holds a stale callback.
  const latest = useRef({ enterEditMode, cancel });
  latest.current = { enterEditMode, cancel };
  const surface = useMemo(
    () => ({
      enter: (opts?: { draft?: InstanceRegistry }) =>
        latest.current.enterEditMode(opts),
      cancel: () => latest.current.cancel(),
    }),
    [],
  );
  useEffect(() => ui.registerSurface("editMode", surface), [ui, surface]);

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
