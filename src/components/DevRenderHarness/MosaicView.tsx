import { useState } from "react";
import { useViewportSize } from "../../hooks/useViewportSize";
import Grid from "../../widgets/Grid";
import { RenderWidget } from "../../widgets/widget";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { RangeInput } from "../inputs";
import {
  HARNESS_GRID,
  HARNESS_INSTANCE_ID,
  NO_PADDING,
  sizeOfSpan,
  Span,
} from "./harness";
import styles from "./styles/DevRenderHarness.module.css";


export function MosaicView({ registry }: { registry: InstanceRegistry }) {
  const viewport = useViewportSize();
  const [maxCols, setMaxCols] = useState(3);
  const [maxRows, setMaxRows] = useState(3);

  const spans: Span[] = Array.from({ length: maxRows }, (_, r) =>
    Array.from({ length: maxCols }, (_, c) => ({ cols: c + 1, rows: r + 1 })),
  ).flat();

  return (
    <div className={styles.mosaic}>
      <div className={styles.mosaicBar}>
        <span className={styles.readoutMuted}>
          Fractions of this {Math.round(viewport.w)}&times;
          {Math.round(viewport.h)} display, in {HARNESS_GRID.cols}ths across and{" "}
          {HARNESS_GRID.rows}ths down
        </span>
        <div className={styles.mosaicSpanControls}>
          <RangeInput
            label="Widest"
            value={maxCols}
            min={1}
            max={HARNESS_GRID.cols}
            step={1}
            onChange={setMaxCols}
          />
          <RangeInput
            label="Tallest"
            value={maxRows}
            min={1}
            max={HARNESS_GRID.rows}
            step={1}
            onChange={setMaxRows}
          />
        </div>
      </div>

      <div className={styles.mosaicTiles}>
        {spans.map((span) => {
          const size = sizeOfSpan(span, viewport);
          return (
            <div key={`${span.cols}x${span.rows}`} className={styles.tile}>
              <div className={styles.tileLabel}>
                {span.cols}/{HARNESS_GRID.cols} &times; {span.rows}/
                {HARNESS_GRID.rows}
                <span className={styles.readoutMuted}>
                  {" "}
                  {Math.round(size.w)}&times;{Math.round(size.h)} px
                </span>
              </div>
              <div
                className={styles.tileBox}
                style={{ width: size.w, height: size.h }}
              >
                <Grid cols={1} rows={1} gap={0} padding={NO_PADDING}>
                  <RenderWidget
                    instanceId={HARNESS_INSTANCE_ID}
                    registry={registry}
                  />
                </Grid>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
