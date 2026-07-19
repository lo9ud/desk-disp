import { PlusIcon as PlusIconLarge } from "@heroicons/react/24/outline";
import { gridItemStyle } from "./gridMath";
import styles from "./styles/grid.module.css";

export function EmptyCells({
  emptyCells,
  onSelect,
}: {
  emptyCells: { col: number; row: number }[];
  onSelect: (col: number, row: number) => void;
}) {
  return (
    <>
      {emptyCells.map(({ col, row }) => (
        <div
          key={`empty-${col}-${row}`}
          className={styles.emptyCell}
          style={gridItemStyle({ col, row, col_span: 1, row_span: 1 })}
          onClick={() => onSelect(col, row)}
        >
          <PlusIconLarge />
        </div>
      ))}
    </>
  );
}
