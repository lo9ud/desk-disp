import styles from "./styles/grid.module.css";
import { ResizeDir } from "./types";

export const RESIZE_DIRS: ResizeDir[] = ["tl", "t", "tr", "r", "br", "b", "bl", "l"];

export function ResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (e: React.PointerEvent, dir: ResizeDir) => void;
}) {
  return (
    <>
      {RESIZE_DIRS.map((dir) => (
        <div
          key={dir}
          className={styles.resizeHandle}
          data-dir={dir}
          data-onboarding={`widget-resize-handle-${dir}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, dir);
          }}
        />
      ))}
    </>
  );
}
