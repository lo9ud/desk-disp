import { createContext } from "react";
import { WidgetPlacement } from "../ffi_types";
import { GridDims } from "../utils/validation";

type WidgetDims = {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const WidgetDimsContext = createContext<WidgetDims | undefined>(undefined);

function gridDimsToWidgetDims(
  gridDims: GridDims,
  placement: WidgetPlacement,
): WidgetDims {
  const { cols, rows, gap, padding } = gridDims;
  const { col, row, col_span, row_span } = placement;
  const totalGapX = gap * (cols - 1);
  const totalGapY = gap * (rows - 1);
  const hPad = padding.left + padding.right;
  const vPad = padding.top + padding.bottom;
  const cellWidth = (100 - hPad - totalGapX) / cols;
  const cellHeight = (100 - vPad - totalGapY) / rows;
  return {
    col,
    row,
    colSpan: col_span,
    rowSpan: row_span,
    x: padding.left + (col - 1) * (cellWidth + gap),
    y: padding.top + (row - 1) * (cellHeight + gap),
    width: cellWidth * col_span + gap * (col_span - 1),
    height: cellHeight * row_span + gap * (row_span - 1),
  };
}
