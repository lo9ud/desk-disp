import { CSSProperties } from "react";
import { WidgetPlacement } from "../../ffi_types";
import { getWidgetDefinition } from "../../registry/defRegistry";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { boxesOverlap, GridDims } from "../../utils/validation";
import { errorSeverity, TooSmallError, WidgetError } from "../../utils/widgetErrors";
import { GhostState, Interaction, RemoveEdge, ResizeDir } from "./types";

export function getBlockedWidgetIds(
  registry: InstanceRegistry,
  edge: RemoveEdge,
  dims: GridDims,
): string[] {
  return registry
    .getAll()
    .filter(({ placement: p }) => {
      switch (edge) {
        case "top":
          return p.row === 1;
        case "bottom":
          return p.row + p.row_span - 1 >= dims.rows;
        case "left":
          return p.col === 1;
        case "right":
          return p.col + p.col_span - 1 >= dims.cols;
      }
    })
    .map(({ id }) => id);
}

export function posToCellCoord(
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

export function applyResizeDir(
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

export function computeGhostPlacement(
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

export function placementFits(p: WidgetPlacement, dims: GridDims): boolean {
  return (
    p.col >= 1 &&
    p.row >= 1 &&
    p.col + p.col_span - 1 <= dims.cols &&
    p.row + p.row_span - 1 <= dims.rows
  );
}

export function checkGhostValid(
  placement: WidgetPlacement,
  instanceId: string,
  dims: GridDims,
  registry: InstanceRegistry,
): boolean {
  if (!placementFits(placement, dims)) return false;
  for (const other of registry.getAll()) {
    if (other.id === instanceId) continue;
    if (boxesOverlap(placement, other.placement)) return false;
  }
  return true;
}

export function computeOccupied(
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

export function computeEmptyCells(
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

export function gridItemStyle(p: WidgetPlacement): CSSProperties {
  return {
    gridColumn: `${p.col} / span ${p.col_span}`,
    gridRow: `${p.row} / span ${p.row_span}`,
  };
}

export function gridContainerStyle(dims: GridDims): CSSProperties {
  return {
    "--grid-cols": dims.cols,
    "--grid-rows": dims.rows,
    "--grid-gap": `${dims.gap}px`,
    "--grid-padding-top": `${dims.padding.top}px`,
    "--grid-padding-right": `${dims.padding.right}px`,
    "--grid-padding-bottom": `${dims.padding.bottom}px`,
    "--grid-padding-left": `${dims.padding.left}px`,
  } as CSSProperties;
}

export function defaultSettings(defId: string): Record<string, unknown> {
  const def = getWidgetDefinition(defId);
  if (!def?.settingsDef) return {};
  const s: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(def.settingsDef)) {
    if ("default" in v) s[k] = v.default;
  }
  return s;
}

export function checkWidgetSize(
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

export function deriveErrorState(errors: WidgetError[]): {
  hasBlockingErrors: boolean;
  hasWarnings: boolean;
  errorWidgetIds: Set<string>;
} {
  return {
    hasBlockingErrors: errors.some((e) => errorSeverity(e) === "error"),
    hasWarnings: errors.some((e) => errorSeverity(e) === "warning"),
    errorWidgetIds: new Set(errors.flatMap((e) => e.widgetIds ?? [])),
  };
}
