import { WidgetPlacement } from "../ffi_types";
import { WidgetInstance } from "../registry/instanceRegistry";
import { OutOfBoundsError, OverlapError, WidgetError } from "./widgetErrors";

export interface GridPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function uniformPadding(n: number): GridPadding {
  return { top: n, right: n, bottom: n, left: n };
}

export interface GridDims {
  cols: number;
  rows: number;
  gap: number;
  padding: GridPadding;
}

function boxesOverlap(a: WidgetPlacement, b: WidgetPlacement): boolean {
  return !(
    a.col + a.col_span <= b.col ||
    b.col + b.col_span <= a.col ||
    a.row + a.row_span <= b.row ||
    b.row + b.row_span <= a.row
  );
}

function checkOutOfBounds(inst: WidgetInstance, gridDims: GridDims): OutOfBoundsError | null {
  const p = inst.placement;
  const colViolation = p.col + p.col_span - 1 > gridDims.cols;
  const rowViolation = p.row + p.row_span - 1 > gridDims.rows;
  if (!colViolation && !rowViolation) return null;
  return {
    kind: "out_of_bounds",
    widgetIds: [inst.id],
    axis: colViolation && rowViolation ? "both" : colViolation ? "col" : "row",
  };
}

function buildAdjacency(instances: WidgetInstance[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const inst of instances) adj.set(inst.id, new Set());
  for (let i = 0; i < instances.length; i++) {
    for (let j = i + 1; j < instances.length; j++) {
      if (boxesOverlap(instances[i].placement, instances[j].placement)) {
        adj.get(instances[i].id)!.add(instances[j].id);
        adj.get(instances[j].id)!.add(instances[i].id);
      }
    }
  }
  return adj;
}

function bfsComponent(startId: string, adj: Map<string, Set<string>>, visited: Set<string>): string[] {
  const component: string[] = [];
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    component.push(id);
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return component;
}

function findOverlapErrors(instances: WidgetInstance[]): OverlapError[] {
  const adj = buildAdjacency(instances);
  const visited = new Set<string>();
  const errors: OverlapError[] = [];
  for (const inst of instances) {
    if (visited.has(inst.id)) continue;
    const component = bfsComponent(inst.id, adj, visited);
    if (component.length > 1) {
      errors.push({ kind: "overlap", widgetIds: component as [string, string, ...string[]] });
    }
  }
  return errors;
}

export function validateLayout(
  instances: WidgetInstance[],
  gridDims: GridDims,
): WidgetError[] {
  const errors: WidgetError[] = [];
  const outOfBoundsIds = new Set<string>();

  for (const inst of instances) {
    const oob = checkOutOfBounds(inst, gridDims);
    if (oob) { outOfBoundsIds.add(inst.id); errors.push(oob); }
  }

  const inBounds = instances.filter((i) => !outOfBoundsIds.has(i.id));
  return [...errors, ...findOverlapErrors(inBounds)];
}
