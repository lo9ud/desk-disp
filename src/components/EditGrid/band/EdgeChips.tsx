import { MinusIcon, PlusIcon } from "@heroicons/react/16/solid";
import { combineClassNames } from "../../../utils/format";
import { GridDims } from "../../../utils/grid";
import styles from "../styles/band.module.css";
import { RemoveEdge } from "../types";

const EDGE_CONFIG: {
  edge: RemoveEdge;
  addLabel: string;
  removeLabel: string;
  axis: "rows" | "cols";
}[] = [
  {
    edge: "top",
    addLabel: "Add row above",
    removeLabel: "Remove top row",
    axis: "rows",
  },
  {
    edge: "bottom",
    addLabel: "Add row below",
    removeLabel: "Remove bottom row",
    axis: "rows",
  },
  {
    edge: "left",
    addLabel: "Add column left",
    removeLabel: "Remove left column",
    axis: "cols",
  },
  {
    edge: "right",
    addLabel: "Add column right",
    removeLabel: "Remove right column",
    axis: "cols",
  },
];

export function EdgeChips({
  dims,
  shiftWidgets,
  updateGridDims,
  tryRemoveEdge,
}: {
  dims: GridDims;
  shiftWidgets: (
    colOffset: number,
    rowOffset: number,
    dimsDelta: Partial<GridDims>,
  ) => void;
  updateGridDims: (dims: Partial<GridDims>) => void;
  tryRemoveEdge: (edge: RemoveEdge) => void;
}) {
  function handleAdd(edge: RemoveEdge) {
    switch (edge) {
      case "top":
        shiftWidgets(0, 1, { rows: dims.rows + 1 });
        break;
      case "bottom":
        updateGridDims({ rows: dims.rows + 1 });
        break;
      case "left":
        shiftWidgets(1, 0, { cols: dims.cols + 1 });
        break;
      case "right":
        updateGridDims({ cols: dims.cols + 1 });
        break;
    }
  }

  return (
    <>
      {EDGE_CONFIG.map(({ edge, addLabel, removeLabel, axis }) => (
        <div
          key={edge}
          className={combineClassNames(styles.edgeChips, styles[edge])}
        >
          <button
            type="button"
            className={styles.edgeChipButton}
            title={addLabel}
            onClick={() => handleAdd(edge)}
          >
            <PlusIcon />
          </button>
          {dims[axis] > 1 && (
            <button
              type="button"
              className={styles.edgeChipButton}
              title={removeLabel}
              onClick={() => tryRemoveEdge(edge)}
            >
              <MinusIcon />
            </button>
          )}
        </div>
      ))}
    </>
  );
}
