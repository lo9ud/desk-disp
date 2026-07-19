import styles from "./styles/grid.module.css";
import { ResizeDir } from "./types";

export function ResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (e: React.PointerEvent, dir: ResizeDir) => void;
}) {
  const dirs: ResizeDir[] = ["tl", "t", "tr", "r", "br", "b", "bl", "l"];
  return (
    <>
      {dirs.map((dir) => (
        <div
          key={dir}
          className={styles.resizeHandle}
          data-dir={dir}
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, dir);
          }}
        />
      ))}
    </>
  );
}
