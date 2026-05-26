import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WidgetPlacement } from "../ffi_types";
import { useEditMode } from "../context/EditModeContext";
import {
  CATEGORIES,
  getAllWidgetDefinitions,
  getWidgetDefinition,
  SelectOptionDef,
  TAGS,
  WidgetDefinition,
  WidgetSettingsDefinition,
} from "../registry/defRegistry";
import {
  InstanceRegistry,
  useWidgetInstanceIds,
} from "../registry/instanceRegistry";
import type { GridDims, GridPadding } from "../utils/validation";
import { errorSeverity, TooSmallError, widgetErrorText } from "../utils/widgetErrors";
import { RenderWidget } from "../widgets/widget";
import WidgetSettingsPanel from "./WidgetSettingsPanel";
import styles from "./styles/EditGrid.module.css";
import { Modal } from "../primitives/Modal";
import { Button } from "../primitives/Button";
import { Input } from "../primitives/Input";
import {
  Cog6ToothIcon,
  PlusCircleIcon,
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  ArrowsUpDownIcon,
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
} from "@heroicons/react/16/solid";
import { PlusIcon as PlusIconLarge } from "@heroicons/react/24/outline";
import { logger } from "../utils/logger";

const { error } = logger("edit-grid");

const PADDING_MIN = 30;
const PADDING_STEP = 10;
const GAP_MIN = 10;
const GAP_STEP = 5;

type ResizeDir = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

type RemoveEdge = "top" | "bottom" | "left" | "right";

function getBlockedWidgetIds(
  registry: InstanceRegistry,
  edge: RemoveEdge,
  dims: GridDims,
): string[] {
  return registry
    .getAll()
    .filter(({ placement: p }) => {
      switch (edge) {
        case "top": return p.row === 1;
        case "bottom": return p.row + p.row_span - 1 >= dims.rows;
        case "left": return p.col === 1;
        case "right": return p.col + p.col_span - 1 >= dims.cols;
      }
    })
    .map(({ id }) => id);
}

interface DragInteraction {
  kind: "move";
  instanceId: string;
  originalPlacement: WidgetPlacement;
  grabOffsetCol: number;
  grabOffsetRow: number;
}

interface ResizeInteraction {
  kind: "resize";
  instanceId: string;
  originalPlacement: WidgetPlacement;
  dir: ResizeDir;
}

type Interaction = DragInteraction | ResizeInteraction;

interface GhostState {
  placement: WidgetPlacement;
  valid: boolean;
}

type PaddingEdge = "top" | "right" | "bottom" | "left";

interface PaddingDragState {
  edge: PaddingEdge;
  startXY: number;
  startPadding: GridPadding;
}

interface AddTarget {
  col: number;
  row: number;
}

function posToCellCoord(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  dims: GridDims,
): { col: number; row: number } {
  const { padding } = dims;
  const x = clientX - rect.left - padding.left;
  const y = clientY - rect.top - padding.top;
  const cellW =
    (rect.width - padding.left - padding.right - dims.gap * (dims.cols - 1)) /
    dims.cols;
  const cellH =
    (rect.height - padding.top - padding.bottom - dims.gap * (dims.rows - 1)) /
    dims.rows;
  return {
    col: Math.max(
      1,
      Math.min(dims.cols, Math.floor(x / (cellW + dims.gap)) + 1),
    ),
    row: Math.max(
      1,
      Math.min(dims.rows, Math.floor(y / (cellH + dims.gap)) + 1),
    ),
  };
}

function applyResizeDir(
  orig: WidgetPlacement,
  dir: ResizeDir,
  targetCell: { col: number; row: number },
  dims: GridDims,
): WidgetPlacement {
  let { col, row, col_span, row_span } = orig;
  const endCol = col + col_span - 1;
  const endRow = row + row_span - 1;

  if (dir.includes("l")) {
    const newCol = Math.max(1, Math.min(endCol, targetCell.col));
    col_span = endCol - newCol + 1;
    col = newCol;
  }
  if (dir.includes("r")) {
    col_span = Math.max(
      1,
      Math.min(dims.cols - col + 1, targetCell.col - col + 1),
    );
  }
  if (dir.includes("t")) {
    const newRow = Math.max(1, Math.min(endRow, targetCell.row));
    row_span = endRow - newRow + 1;
    row = newRow;
  }
  if (dir.includes("b")) {
    row_span = Math.max(
      1,
      Math.min(dims.rows - row + 1, targetCell.row - row + 1),
    );
  }

  return { col, row, col_span, row_span };
}

function computeGhostPlacement(
  interaction: Interaction,
  targetCell: { col: number; row: number },
  dims: GridDims,
): WidgetPlacement {
  if (interaction.kind === "move") {
    const { originalPlacement, grabOffsetCol, grabOffsetRow } = interaction;
    const newCol = Math.max(
      1,
      Math.min(
        dims.cols - originalPlacement.col_span + 1,
        targetCell.col - grabOffsetCol,
      ),
    );
    const newRow = Math.max(
      1,
      Math.min(
        dims.rows - originalPlacement.row_span + 1,
        targetCell.row - grabOffsetRow,
      ),
    );
    return { ...originalPlacement, col: newCol, row: newRow };
  }
  return applyResizeDir(
    interaction.originalPlacement,
    interaction.dir,
    targetCell,
    dims,
  );
}

function placementFits(p: WidgetPlacement, dims: GridDims): boolean {
  return (
    p.col >= 1 &&
    p.row >= 1 &&
    p.col + p.col_span - 1 <= dims.cols &&
    p.row + p.row_span - 1 <= dims.rows
  );
}

function checkGhostValid(
  placement: WidgetPlacement,
  instanceId: string,
  dims: GridDims,
  registry: InstanceRegistry,
): boolean {
  if (!placementFits(placement, dims)) return false;
  for (const other of registry.getAll()) {
    if (other.id === instanceId) continue;
    const op = other.placement;
    const overlapsCol =
      placement.col < op.col + op.col_span &&
      placement.col + placement.col_span > op.col;
    const overlapsRow =
      placement.row < op.row + op.row_span &&
      placement.row + placement.row_span > op.row;
    if (overlapsCol && overlapsRow) return false;
  }
  return true;
}

function computeOccupied(
  registry: InstanceRegistry | null,
  ghost: GhostState | null,
  interaction: Interaction | null,
): Set<string> {
  const occupied = new Set<string>();
  if (!registry) return occupied;
  for (const inst of registry.getAll()) {
    const p =
      ghost?.placement && interaction?.instanceId === inst.id
        ? ghost.placement
        : inst.placement;
    for (let c = p.col; c < p.col + p.col_span; c++) {
      for (let r = p.row; r < p.row + p.row_span; r++) {
        occupied.add(`${c},${r}`);
      }
    }
  }
  return occupied;
}

function computeEmptyCells(
  occupied: Set<string>,
  dims: GridDims,
): { col: number; row: number }[] {
  const cells: { col: number; row: number }[] = [];
  for (let c = 1; c <= dims.cols; c++) {
    for (let r = 1; r <= dims.rows; r++) {
      if (!occupied.has(`${c},${r}`)) cells.push({ col: c, row: r });
    }
  }
  return cells;
}

function gridItemStyle(p: WidgetPlacement): CSSProperties {
  return {
    gridColumn: `${p.col} / span ${p.col_span}`,
    gridRow: `${p.row} / span ${p.row_span}`,
  };
}

function defaultSettings(defId: string): Record<string, unknown> {
  const def = getWidgetDefinition(defId);
  if (!def?.settingsDef) return {};
  const s: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(def.settingsDef)) {
    if ("default" in v) s[k] = v.default;
  }
  return s;
}

/* Sub-components */

function ResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (e: React.PointerEvent, dir: ResizeDir) => void;
}) {
  const dirs: ResizeDir[] = ["tl", "t", "tr", "r", "br", "b", "bl", "l"];
  return (
    <>
      {dirs.map((dir) => (
        <div
          key={dir}
          className={styles.resizeHandle}
          data-dir={dir}
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, dir);
          }}
        />
      ))}
    </>
  );
}

function AddWidgetModal({
  onAdd,
  onClose,
}: {
  onAdd: (defId: string) => void;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const defs = getAllWidgetDefinitions();
  return (
    <Modal
      title="Add widget"
      actions={[
        <Button key="close" variant="ghost_danger" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      <Input
        type="text"
        placeholder="Search widgets…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
        autoFocus
      />
      <div className={styles.modalList}>
        {defs
          .filter(
            (def) =>
              def.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              def.tags?.some((t) =>
                t.toLowerCase().includes(searchTerm.toLowerCase()),
              ) ||
              def.category.toLowerCase().includes(searchTerm.toLowerCase()),
          )
          .map((def) => (
            <WidgetEntry key={def.id} def={def} onAdd={onAdd} />
          ))}
      </div>
    </Modal>
  );
}

function optionLabel(opt: string | SelectOptionDef): string {
  return typeof opt === "string" ? opt : opt.label;
}

function primitiveDefault(val: unknown): string | undefined {
  return ["string", "number", "boolean"].includes(typeof val)
    ? String(val as string | number | boolean)
    : undefined;
}

function SettingDescription({
  setting,
}: {
  setting: WidgetSettingsDefinition[string];
}) {
  if (setting.type === "select") {
    const opts = setting.options;
    const labels = Object.values(opts).map(optionLabel).join(" | ");
    const defaultOpt =
      "default" in setting ? opts[setting.default as string] : undefined;
    const defaultStr =
      defaultOpt === undefined ? undefined : optionLabel(defaultOpt);
    const optionsWithSubs = Object.values(opts).filter(
      (v) =>
        typeof v === "object" &&
        v.settings &&
        Object.keys(v.settings).length > 0,
    ) as Required<SelectOptionDef>[];
    return (
      <li className={styles.settingItem}>
        {setting.label}: {labels}
        {defaultStr !== undefined && ` (default: ${defaultStr})`}
        {optionsWithSubs.length > 0 && (
          <ul className={styles.settingsSublist}>
            {optionsWithSubs.map((opt) => (
              <li key={opt.label} className={styles.settingsSubOption}>
                <span className={styles.settingsWhenLabel}>
                  When "{opt.label}":
                </span>
                <ul className={styles.settingsSubItems}>
                  {Object.values(opt.settings).map((sub) => (
                    <SettingDescription key={sub.label} setting={sub} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  const defaultStr =
    "default" in setting ? primitiveDefault(setting.default) : undefined;
  return (
    <li className={styles.settingItem}>
      {setting.label}: {setting.type}
      {defaultStr !== undefined && ` (default: ${defaultStr})`}
    </li>
  );
}

function WidgetEntry({
  def,
  onAdd,
}: {
  def: WidgetDefinition;
  onAdd: (defId: string) => void;
}) {
  const hasSettings =
    def.settingsDef && Object.keys(def.settingsDef).length > 0;
  return (
    <div className={styles.widgetEntry}>
      <div className={styles.widgetName}>{def.name}</div>
      <div className={styles.widgetCategory}>{CATEGORIES[def.category]}</div>
      <div className={styles.widgetTags}>
        {def.tags?.map((t) => (
          <span
            key={t}
            style={{ "--tag-color": TAGS[t] } as CSSProperties}
            className={styles.widgetTag}
          >
            {t}
          </span>
        ))}
      </div>
      <div className={styles.widgetAddButtonContainer}>
        <Button variant="default" onClick={() => onAdd(def.id)}>
          <PlusCircleIcon />
        </Button>
      </div>
      <div className={styles.widgetDescription}>{def.description}</div>
      {hasSettings && (
        <div className={styles.widgetSettings}>
          <p className={styles.settingsLabel}>Available Settings:</p>
          <ul className={styles.settingsList}>
            {Object.values(def.settingsDef).map((s) => (
              <SettingDescription key={s.label} setting={s} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function checkWidgetSize(
  id: string,
  placement: WidgetPlacement,
  minSize: [number | null, number | null],
  cellW: number,
  cellH: number,
  gap: number,
): TooSmallError | null {
  const [minW, minH] = minSize;
  if (minW === null && minH === null) return null;
  const ww = cellW * placement.col_span + gap * (placement.col_span - 1);
  const wh = cellH * placement.row_span + gap * (placement.row_span - 1);
  const tooNarrow = minW !== null && ww < minW;
  const tooShort = minH !== null && wh < minH;
  if (!tooNarrow && !tooShort) return null;
  return {
    kind: "too_small",
    widgetIds: [id],
    axis: tooNarrow && tooShort ? "both" : tooNarrow ? "width" : "height",
    minSize: [minW ?? 0, minH ?? 0],
    actualSize: [Math.round(ww), Math.round(wh)],
  };
}

/* Main component */

export default function EditGrid() {
  const {
    draftGridDims: dims,
    widgetErrors,
    editRegistry,
    moveWidget,
    addWidget,
    removeWidget,
    updateGridDims,
    shiftWidgets,
    save,
    cancel,
  } = useEditMode();

  const allIds = useWidgetInstanceIds(editRegistry ?? undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [gapOpen, setGapOpen] = useState(false);
  const [flashingIds, setFlashingIds] = useState<ReadonlySet<string>>(new Set());
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const paddingDragRef = useRef<PaddingDragState | null>(null);
  const gapDragRef = useRef<{ startX: number; startGap: number } | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (paddingDragRef.current) {
        const { edge, startXY, startPadding } = paddingDragRef.current;
        const isVertical = edge === "top" || edge === "bottom";
        const delta = (isVertical ? e.clientY : e.clientX) - startXY;
        const sign = edge === "top" || edge === "left" ? 1 : -1;
        const newVal = Math.max(
          PADDING_MIN,
          Math.round((startPadding[edge] + sign * delta)/PADDING_STEP)*PADDING_STEP,
        );
        updateGridDims({ padding: { ...startPadding, [edge]: newVal } });
        return;
      }
      const ia = interactionRef.current;
      if (!ia || !containerRef.current || !editRegistry) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cell = posToCellCoord(e.clientX, e.clientY, rect, dims);
      const placement = computeGhostPlacement(ia, cell, dims);
      const valid = checkGhostValid(
        placement,
        ia.instanceId,
        dims,
        editRegistry,
      );
      setGhost({ placement, valid });
    },
    [dims, editRegistry, updateGridDims],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (paddingDragRef.current) {
        containerRef.current?.releasePointerCapture(e.pointerId);
        paddingDragRef.current = null;
        return;
      }
      const ia = interactionRef.current;
      if (!ia) return;
      containerRef.current?.releasePointerCapture(e.pointerId);
      if (ghost?.valid) {
        moveWidget(ia.instanceId, ghost.placement);
      }
      setInteraction(null);
      setGhost(null);
    },
    [ghost, moveWidget],
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (interactionRef.current) {
        setInteraction(null);
        setGhost(null);
      }
      paddingDragRef.current = null;
    }
  }, []);

  function startPaddingDrag(e: React.PointerEvent, edge: PaddingEdge) {
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    paddingDragRef.current = {
      edge,
      startXY: edge === "top" || edge === "bottom" ? e.clientY : e.clientX,
      startPadding: dims.padding,
    };
  }

  function handleGapPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    gapDragRef.current = { startX: e.clientX, startGap: dims.gap };
  }

  function handleGapPointerMove(e: React.PointerEvent) {
    if (!gapDragRef.current) return;
    const delta = e.clientX - gapDragRef.current.startX;
    updateGridDims({
      gap: Math.max(GAP_MIN, Math.round((gapDragRef.current.startGap + delta / 2)/GAP_STEP)*GAP_STEP),
    });
  }

  function handleGapPointerUp() {
    gapDragRef.current = null;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlePointerMove, handlePointerUp, handleKeyDown]);

  function startDrag(e: React.PointerEvent, instanceId: string) {
    if (!containerRef.current || !editRegistry) return;
    const inst = editRegistry.get(instanceId);
    if (!inst) return;
    const p = inst.placement;
    const rect = containerRef.current.getBoundingClientRect();
    const cell = posToCellCoord(e.clientX, e.clientY, rect, dims);
    const ia: DragInteraction = {
      kind: "move",
      instanceId,
      originalPlacement: p,
      grabOffsetCol: cell.col - p.col,
      grabOffsetRow: cell.row - p.row,
    };
    containerRef.current.setPointerCapture(e.pointerId);
    setInteraction(ia);
    setGhost({ placement: p, valid: true });
  }

  function startResize(
    e: React.PointerEvent,
    instanceId: string,
    dir: ResizeDir,
  ) {
    if (!containerRef.current || !editRegistry) return;
    const inst = editRegistry.get(instanceId);
    if (!inst) return;
    const ia: ResizeInteraction = {
      kind: "resize",
      instanceId,
      originalPlacement: inst.placement,
      dir,
    };
    containerRef.current.setPointerCapture(e.pointerId);
    setInteraction(ia);
    setGhost({ placement: inst.placement, valid: true });
  }

  function handleAddWidget(defId: string) {
    if (!addTarget) return;
    const placement: WidgetPlacement = {
      col: addTarget.col,
      row: addTarget.row,
      col_span: 1,
      row_span: 1,
    };
    addWidget(defId, placement, defaultSettings(defId) as Record<string, any>);
    setAddTarget(null);
  }

  function tryRemoveEdge(edge: RemoveEdge) {
    if (!editRegistry) return;
    const blocked = getBlockedWidgetIds(editRegistry, edge, dims);
    if (blocked.length > 0) {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlashingIds(new Set());
      requestAnimationFrame(() => {
        setFlashingIds(new Set(blocked));
        flashTimeoutRef.current = setTimeout(() => setFlashingIds(new Set()), 620);
      });
      return;
    }
    switch (edge) {
      case "top": shiftWidgets(0, -1, { rows: dims.rows - 1 }); break;
      case "bottom": updateGridDims({ rows: dims.rows - 1 }); break;
      case "left": shiftWidgets(-1, 0, { cols: dims.cols - 1 }); break;
      case "right": updateGridDims({ cols: dims.cols - 1 }); break;
    }
  }

  // Track container pixel size for size-error computation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Derive size warnings from actual pixel dimensions vs widget minSize.
  // widgetErrors in deps catches placement changes (setWidgetErrors always creates new ref).
  const sizeErrors = useMemo((): TooSmallError[] => {
    if (!containerSize || !editRegistry) return [];
    const { w, h } = containerSize;
    const { padding, gap, cols, rows } = dims;
    const cellW = (w - padding.left - padding.right - gap * (cols - 1)) / cols;
    const cellH = (h - padding.top - padding.bottom - gap * (rows - 1)) / rows;
    return editRegistry.getAll().flatMap((inst) => {
      const def = getWidgetDefinition(inst.definitionId);
      const err = checkWidgetSize(inst.id, inst.placement, def?.minSize ?? [null, null], cellW, cellH, gap);
      return err ? [err] : [];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIds, dims, containerSize, widgetErrors]);

  const allErrors = [...widgetErrors, ...sizeErrors];
  const hasBlockingErrors = allErrors.some((e) => errorSeverity(e) === "error");
  const hasWarnings = allErrors.some((e) => errorSeverity(e) === "warning");
  const errorWidgetIds = new Set(allErrors.flatMap((e) => e.widgetIds ?? []));

  async function performSave() {
    setConfirmSaveOpen(false);
    setSaving(true);
    try {
      await save();
    } catch (err) {
      error("Save failed:", err?.toString());
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (hasBlockingErrors) return;
    if (hasWarnings) { setConfirmSaveOpen(true); return; }
    performSave();
  }

  const occupied = computeOccupied(editRegistry, ghost, interaction);
  const emptyCells = computeEmptyCells(occupied, dims);

  const containerStyle = {
    "--grid-cols": dims.cols,
    "--grid-rows": dims.rows,
    "--grid-gap": `${dims.gap}px`,
    "--grid-padding-top": `${dims.padding.top}px`,
    "--grid-padding-right": `${dims.padding.right}px`,
    "--grid-padding-bottom": `${dims.padding.bottom}px`,
    "--grid-padding-left": `${dims.padding.left}px`,
  } as CSSProperties;

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.container} container`}
        style={containerStyle}
      >
        {/* Active widget tiles */}
        {allIds.map((id) => {
          const inst = editRegistry?.get(id);
          if (!inst) return null;
          const p = inst.placement;
          const def = getWidgetDefinition(inst.definitionId);
          const hasError = errorWidgetIds.has(id);
          const errorClass = hasError
            ? (allErrors.some((e) => e.widgetIds.includes(id) && errorSeverity(e) === "error")
                ? styles.widgetError
                : styles.widgetWarning)
            : "";
          return (
            <div
              key={id}
              className={`${styles.widgetOverlay} ${flashingIds.has(id) ? styles.widgetFlash : ""} ${errorClass}`}
              style={gridItemStyle(p)}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
                e.preventDefault();
                startDrag(e, id);
              }}
            >
              <div className={styles.widgetButtons} data-no-drag>
                {def?.settingsDef &&
                  Object.keys(def.settingsDef).length > 0 && (
                    <button
                      className={styles.iconButton}
                      title="Widget settings"
                      onClick={() =>
                        setOpenSettingsId(openSettingsId === id ? null : id)
                      }
                    >
                      <Cog6ToothIcon />
                    </button>
                  )}
                <button
                  className={`${styles.iconButton} ${styles.danger}`}
                  title="Remove widget"
                  onClick={() => removeWidget(id)}
                >
                  <XMarkIcon />
                </button>
              </div>
              <div className={styles.widgetPreview}>
                <RenderWidget
                  instanceId={id}
                  registry={editRegistry ?? undefined}
                />
              </div>
              {openSettingsId === id && (
                <WidgetSettingsPanel
                  instanceId={id}
                  onClose={() => setOpenSettingsId(null)}
                />
              )}
              <ResizeHandles
                onResizeStart={(e, dir) => startResize(e, id, dir)}
              />
            </div>
          );
        })}

        {/* Empty cell buttons */}
        {emptyCells.map(({ col, row }) => (
          <div
            key={`empty-${col}-${row}`}
            className={styles.emptyCell}
            style={gridItemStyle({ col, row, col_span: 1, row_span: 1 })}
            onClick={() => setAddTarget({ col, row })}
          >
            <PlusIconLarge />
          </div>
        ))}

        {/* Drag/resize ghost */}
        {ghost && (
          <div
            className={`${styles.ghost} ${ghost.valid ? styles.valid : styles.invalid}`}
            style={gridItemStyle(ghost.placement)}
          />
        )}

        {/* Per-edge padding handles */}
        {(["top", "right", "bottom", "left"] as const).map((edge) => {
          const isVertical = edge === "top" || edge === "bottom";
          const GripIcon = isVertical ? ArrowsUpDownIcon : ArrowsRightLeftIcon;
          return (
            <div
              key={`padding-${edge}`}
              className={`${styles.paddingHandle} ${styles[edge]}`}
              onPointerDown={(e) => startPaddingDrag(e, edge)}
            >
              <GripIcon className={styles.paddingHandleGrip} />
              <span className={styles.paddingHandleLabel}>
                {dims.padding[edge]}px
              </span>
            </div>
          );
        })}

        {/* Grid edge controls */}
        <div className={`${styles.edgeControls} ${styles.top}`}>
          <button
            className={styles.edgeButton}
            title="Add row above"
            onClick={() => shiftWidgets(0, 1, { rows: dims.rows + 1 })}
          >
            <PlusIcon />
          </button>
          {dims.rows > 1 && (
            <button
              className={styles.edgeButton}
              title="Remove top row"
              onClick={() => tryRemoveEdge("top")}
            >
              <MinusIcon />
            </button>
          )}
        </div>
        <div className={`${styles.edgeControls} ${styles.bottom}`}>
          <button
            className={styles.edgeButton}
            title="Add row below"
            onClick={() => updateGridDims({ rows: dims.rows + 1 })}
          >
            <PlusIcon />
          </button>
          {dims.rows > 1 && (
            <button
              className={styles.edgeButton}
              title="Remove bottom row"
              onClick={() => tryRemoveEdge("bottom")}
            >
              <MinusIcon />
            </button>
          )}
        </div>
        <div className={`${styles.edgeControls} ${styles.left}`}>
          <button
            className={styles.edgeButton}
            title="Add column left"
            onClick={() => shiftWidgets(1, 0, { cols: dims.cols + 1 })}
          >
            <PlusIcon />
          </button>
          {dims.cols > 1 && (
            <button
              className={styles.edgeButton}
              title="Remove left column"
              onClick={() => tryRemoveEdge("left")}
            >
              <MinusIcon />
            </button>
          )}
        </div>
        <div className={`${styles.edgeControls} ${styles.right}`}>
          <button
            className={styles.edgeButton}
            title="Add column right"
            onClick={() => updateGridDims({ cols: dims.cols + 1 })}
          >
            <PlusIcon />
          </button>
          {dims.cols > 1 && (
            <button
              className={styles.edgeButton}
              title="Remove right column"
              onClick={() => tryRemoveEdge("right")}
            >
              <MinusIcon />
            </button>
          )}
        </div>
      </div>

      {/* Save/cancel bar */}
      <div className={styles.editBar}>
        {allErrors.length > 0 && (
          <span className={hasBlockingErrors ? styles.errorBadge : styles.warningBadge}>
            {allErrors.length} {hasBlockingErrors ? "error" : "warning"}{allErrors.length > 1 ? "s" : ""}
          </span>
        )}
        <button
          className={`${styles.barButton} ${styles.secondary}`}
          onClick={cancel}
        >
          Cancel
        </button>
        <button
          className={`${styles.barButton} ${styles.primary}`}
          disabled={hasBlockingErrors || saving}
          onClick={handleSaveClick}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <div className={styles.gapControl}>
          {gapOpen && (
            <>
              <span>Gap:</span>
              <div
                className={styles.gapScrubber}
                onPointerDown={handleGapPointerDown}
                onPointerMove={handleGapPointerMove}
                onPointerUp={handleGapPointerUp}
              >
                <ArrowLongLeftIcon /> {dims.gap}px <ArrowLongRightIcon />
              </div>
            </>
          )}
          <button
            className={styles.gapToggle}
            onClick={() => setGapOpen((v) => !v)}
            title="More settings"
          >
            {gapOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </button>
        </div>
      </div>

      {/* Add-widget modal */}
      {addTarget && (
        <AddWidgetModal
          onAdd={handleAddWidget}
          onClose={() => setAddTarget(null)}
        />
      )}

      {/* Save-with-warnings confirmation modal */}
      {confirmSaveOpen && (
        <Modal
          title="Save with warnings?"
          actions={[
            <Button key="cancel" variant="ghost_danger" onClick={() => setConfirmSaveOpen(false)}>
              Cancel
            </Button>,
            <Button key="save" variant="default" onClick={performSave}>
              Save anyway
            </Button>,
          ]}
        >
          <ul className={styles.errorList}>
            {allErrors.map((e) => (
              <li key={`${e.kind}-${e.widgetIds.join(",")}`}>{widgetErrorText(e).message}</li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
