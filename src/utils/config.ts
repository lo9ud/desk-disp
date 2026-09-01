import { WidgetPlacement } from "../ffi_types";
import { WidgetPlacementProps } from "../widgets/widget";

export function widgetPlacementToProps(placement: WidgetPlacement): WidgetPlacementProps {
  return { col: placement.col, colSpan: placement.col_span, row: placement.row, rowSpan: placement.row_span };
}
