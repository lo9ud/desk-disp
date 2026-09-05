import { WidgetPlacement } from "../../ffi_types";
import type { GridPadding } from "../../ffi_types";

export type ResizeDir = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

export type RemoveEdge = "top" | "bottom" | "left" | "right";

export interface DragInteraction {
  kind: "move";
  instanceId: string;
  originalPlacement: WidgetPlacement;
  grabOffsetCol: number;
  grabOffsetRow: number;
}

export interface ResizeInteraction {
  kind: "resize";
  instanceId: string;
  originalPlacement: WidgetPlacement;
  dir: ResizeDir;
}

export type Interaction = DragInteraction | ResizeInteraction;

export interface GhostState {
  placement: WidgetPlacement;
  valid: boolean;
}

export type PaddingEdge = "top" | "right" | "bottom" | "left";

export interface PaddingDragState {
  edge: PaddingEdge;
  startXY: number;
  startPadding: GridPadding;
}
