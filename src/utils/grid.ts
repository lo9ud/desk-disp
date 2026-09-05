import { GridPadding } from "../ffi_types";

export interface GridDims {
  cols: number;
  rows: number;
  gap: number;
  padding: GridPadding;
}
