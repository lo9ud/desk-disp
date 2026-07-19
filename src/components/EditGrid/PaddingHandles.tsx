import {
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
} from "@heroicons/react/16/solid";
import type { GridPadding } from "../../utils/validation";
import styles from "./styles/grid.module.css";
import { PaddingEdge } from "./types";

export function PaddingHandles({
  padding,
  onDragStart,
}: {
  padding: GridPadding;
  onDragStart: (e: React.PointerEvent, edge: PaddingEdge) => void;
}) {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((edge) => {
        const isVertical = edge === "top" || edge === "bottom";
        const GripIcon = isVertical ? ArrowsUpDownIcon : ArrowsRightLeftIcon;
        return (
          <div
            key={`padding-${edge}`}
            className={`${styles.paddingHandle} ${styles[edge]}`}
            onPointerDown={(e) => onDragStart(e, edge)}
          >
            <GripIcon className={styles.paddingHandleGrip} />
            <span className={styles.paddingHandleLabel}>
              {padding[edge]}px
            </span>
          </div>
        );
      })}
    </>
  );
}
