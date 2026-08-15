import { PlusIcon as PlusIconLarge } from "@heroicons/react/24/outline";
import { combineClassNames } from "../../utils/format";
import { gridItemStyle } from "./gridMath";
import styles from "./styles/grid.module.css";

export function EmptyCells({
  emptyCells,
  onSelect,
  pendingCell,
}: {
  emptyCells: { col: number; row: number }[];
  onSelect: (col: number, row: number) => void;
  pendingCell?: { col: number; row: number } | null;
}) {
  return (
    <>
      {emptyCells.map(({ col, row }) => (
        <div
          key={`empty-${col}-${row}`}
          className={combineClassNames(
            styles.emptyCell,
            pendingCell?.col === col && pendingCell?.row === row
              ? styles.emptyCellPending
              : undefined,
          )}
          style={gridItemStyle({ col, row, col_span: 1, row_span: 1 })}
          onClick={() => onSelect(col, row)}
        >
          <PlusIconLarge />
        </div>
      ))}
    </>
  );
}
