import {
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
} from "@heroicons/react/16/solid";
import { combineClassNames } from "../../../utils/format";
import type { GridPadding } from "../../../ffi_types";
import styles from "../styles/band.module.css";
import { PaddingEdge } from "../types";

export function PaddingPills({
  padding,
  onDragStart,
  onGuide,
}: {
  padding: GridPadding;
  onDragStart: (e: React.PointerEvent, edge: PaddingEdge) => void;
  onGuide: (edge: PaddingEdge | null) => void;
}) {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((edge) => {
        const isVertical = edge === "top" || edge === "bottom";
        const GripIcon = isVertical ? ArrowsUpDownIcon : ArrowsRightLeftIcon;
        return (
          <div
            key={`padding-${edge}`}
            className={combineClassNames(styles.paddingPill, styles[edge])}
            title={`Drag to adjust ${edge} padding`}
            onPointerDown={(e) => onDragStart(e, edge)}
            onPointerEnter={() => onGuide(edge)}
            onPointerLeave={() => onGuide(null)}
          >
            <GripIcon /> {padding[edge]}px
          </div>
        );
      })}
    </>
  );
}
