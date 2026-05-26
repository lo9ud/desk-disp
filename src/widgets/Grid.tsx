import { createContext, CSSProperties, useContext, useMemo } from "react";
import styles from "./styles/Grid.module.css";
import { combineClassNames } from "../utils/format";
import type { GridPadding } from "../utils/validation";

export type GridSize = { cols: number; rows: number; gap: number; padding: GridPadding };

const GridSizeContext = createContext<GridSize>({
  cols: 1, rows: 1, gap: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
});

export function useGridSize(): GridSize {
  return useContext(GridSizeContext);
}

type GridProps = {
  cols: number;
  rows: number;
  gap: number;
  padding: GridPadding;
  children?: React.ReactNode;
  className?: string;
  style?: CSSProperties;
};

export default function Grid({ cols, rows, gap, padding, children, className, style }: GridProps) {
  const p = padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const gridStyle = {
    "--grid-cols": cols,
    "--grid-rows": rows,
    "--grid-gap": `${gap ?? 0}px`,
    "--grid-padding-top": `${p.top}px`,
    "--grid-padding-right": `${p.right}px`,
    "--grid-padding-bottom": `${p.bottom}px`,
    "--grid-padding-left": `${p.left}px`,
    ...style,
  } as CSSProperties;

  const value = useMemo(() => ({ cols, rows, gap, padding }), [cols, rows, gap, padding]);
  return (
    <GridSizeContext.Provider value={value}>
      <div className={combineClassNames(styles.grid, className)} style={gridStyle}>
        {children}
      </div>
    </GridSizeContext.Provider>
  );
}
