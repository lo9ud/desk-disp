import { useRef, useState } from "react";
import Grid from "../../widgets/Grid";
import { RenderWidget } from "../../widgets/widget";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { Button } from "../../primitives/Button";
import {
  Bound,
  declaredLimit,
  DEFAULT_STAGE_SPAN,
  HARNESS_GRID,
  HARNESS_INSTANCE_ID,
  hasLimit,
  limitText,
  NO_PADDING,
  Size,
  spanOfSize,
  sizeOfSpan,
  Span,
  StageSize,
} from "./harness";
import type { WidgetDefinition } from "../../registry/defRegistry";
import styles from "./styles/DevRenderHarness.module.css";
import { Input } from "../../primitives/Input";

const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Handle = (typeof HANDLES)[number];

const HANDLE_CURSOR: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

interface Drag {
  handle: Handle;
  x0: number;
  y0: number;
  start: Size;
}

export function StageView({
  registry,
  def,
  stage,
}: {
  registry: InstanceRegistry;
  def: WidgetDefinition;
  stage: StageSize;
}) {
  const { areaRef, area, size, setSize } = stage;
  const dragRef = useRef<Drag | null>(null);

  function onHandleDown(e: React.PointerEvent, handle: Handle) {
    if (!size) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { handle, x0: e.clientX, y0: e.clientY, start: size };
  }

  function onHandleMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;

    let { w, h } = drag.start;
    if (drag.handle.includes("e")) w = drag.start.w + dx * 2;
    if (drag.handle.includes("w")) w = drag.start.w - dx * 2;
    if (drag.handle.includes("s")) h = drag.start.h + dy * 2;
    if (drag.handle.includes("n")) h = drag.start.h - dy * 2;
    setSize({ w, h });
  }

  function onHandleUp(e: React.PointerEvent) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const span = size && area ? spanOfSize(size, area) : DEFAULT_STAGE_SPAN;

  return (
    <div className={styles.stage}>
      <div ref={areaRef} className={styles.stageArea}>
        {size && (
          <div
            className={styles.stageBox}
            style={{ width: size.w, height: size.h }}
          >
            <Grid cols={1} rows={1} gap={0} padding={NO_PADDING}>
              <RenderWidget
                instanceId={HARNESS_INSTANCE_ID}
                registry={registry}
              />
            </Grid>
            {HANDLES.map((handle) => (
              <div
                key={handle}
                className={styles.handle}
                data-handle={handle}
                style={{ cursor: HANDLE_CURSOR[handle] }}
                onPointerDown={(e) => onHandleDown(e, handle)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              />
            ))}
          </div>
        )}
      </div>

      <div className={styles.stageBar}>
        <div className={styles.readoutContainer}>
          <div className={styles.readout}>
            {size ? (
              <>
                <SizeField
                  label="Width"
                  value={size.w}
                  onCommit={(w) => setSize({ w, h: size.h })}
                />
                {" × "}
                <SizeField
                  label="Height"
                  value={size.h}
                  onCommit={(h) => setSize({ w: size.w, h })}
                />
              </>
            ) : (
              <span className={styles.readoutValue}>—</span>
            )}
            <span> px</span>
          </div>
          <Button size="sm" onClick={stage.fill}>
            Fill area
          </Button>
          <Button size="sm" onClick={stage.reset}>
            Reset
          </Button>
        </div>
        <div className={styles.clampToggles}>
          <ClampToggle bound="min" def={def} stage={stage} />
          <ClampToggle bound="max" def={def} stage={stage} />
        </div>
        <SpanPicker
          value={span}
          onPick={(next) => area && setSize(sizeOfSpan(next, area))}
        />
      </div>
    </div>
  );
}

function ClampToggle({
  bound,
  def,
  stage,
}: {
  bound: Bound;
  def: WidgetDefinition;
  stage: StageSize;
}) {
  const limit = declaredLimit(def, bound);
  const declared = hasLimit(limit);
  const on = stage.clamp[bound];

  return (
    <Button
      size="sm"
      variant={on ? "accent" : "ghost"}
      disabled={!declared}
      aria-pressed={on}
      title={
        declared
          ? `Stop the stage going ${bound === "min" ? "below" : "above"} the widget's declared ${bound} size (${limitText(limit)})`
          : `This widget declares no ${bound} size`
      }
      onClick={() => stage.toggleClamp(bound)}
    >
      Clamp {bound}
    </Button>
  );
}

function SizeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function nudge(by: number) {
    setDraft(null);
    onCommit(Math.round(value) + by);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      mono
      aria-label={label}
      className={styles.readoutValue}
      value={draft ?? String(Math.round(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = Number(e.target.value.trim());
        if (e.target.value.trim() && Number.isFinite(next) && next > 0) {
          onCommit(next);
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        // Esc would otherwise reach the harness's own handler and close it.
        if (e.key === "Escape" || e.key === "Enter") {
          e.stopPropagation();
          setDraft(null);
          e.currentTarget.blur();
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          nudge((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
        }
      }}
    />
  );
}


function SpanPicker({
  value,
  onPick,
}: {
  value: Span;
  onPick: (span: Span) => void;
}) {
  const [hover, setHover] = useState<Span | null>(null);
  const active = hover ?? value;

  return (
    <div
      className={styles.spanPicker}
      style={{ gridTemplateColumns: `repeat(${HARNESS_GRID.cols}, 12px)` }}
      onPointerLeave={() => setHover(null)}
      title="Size the preview to a fraction of the stage"
    >
      {Array.from({ length: HARNESS_GRID.rows }, (_, r) =>
        Array.from({ length: HARNESS_GRID.cols }, (_, c) => {
          const span: Span = { cols: c + 1, rows: r + 1 };
          return (
            <button
              key={`${c}-${r}`}
              type="button"
              className={styles.spanCell}
              data-on={
                (span.cols <= active.cols && span.rows <= active.rows) ||
                undefined
              }
              aria-label={`${span.cols} by ${span.rows}`}
              onPointerEnter={() => setHover(span)}
              onClick={() => onPick(span)}
            />
          );
        }),
      )}
    </div>
  );
}
