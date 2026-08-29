import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { CSSProperties } from "react";
import {
  CATEGORIES,
  TAGS,
  WidgetDefinition,
} from "../../../registry/defRegistry";
import { Button } from "../../../primitives/Button";
import styles from "../styles/rail.module.css";
import { CardPreview } from "./CardPreview";
import { PreviewInstanceRegistry, usePreviewPreset } from "./previewRegistry";

export function RailCard({
  def,
  registry,
  instanceId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  def: WidgetDefinition;
  registry: PreviewInstanceRegistry;
  instanceId: string;
  onPointerDown: (e: React.PointerEvent, defId: string) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
}) {
  const { index, count } = usePreviewPreset(instanceId, registry);

  return (
    <div
      className={styles.card}
      onPointerDown={(e) => onPointerDown(e, def.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className={styles.cardCategory}>{CATEGORIES[def.category]}</div>
      <div className={styles.cardTitleRow}>
        <span className={styles.cardName}>{def.name}</span>
        {def.tags?.map((t) => (
          <span
            key={t}
            style={{ "--tag-color": TAGS[t] } as CSSProperties}
            className={styles.cardTag}
          >
            {t}
          </span>
        ))}
      </div>
      <div className={styles.cardDesc} title={def.description}>
        {def.description}
      </div>
      <CardPreview registry={registry} def={def} instanceId={instanceId} />
      {/* Always rendered, even for a widget that declares no presets: index 0
          is its defaults, so that case is one inert dot and dead arrows rather
          than a card whose footer is missing and whose height doesn't match
          its neighbours'. */}
      <div
        className={styles.cardPresets}
        // The card itself is the drag surface, so the stepper has to claim the
        // whole pointer sequence -- letting pointerdown through would arm
        // useRailDrag, and the matching pointerup would read as a click on the
        // card and place the widget on the grid.
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <Button
          variant="icon"
          size="sm"
          disabled={count <= 1}
          title="Previous preset"
          aria-label="Previous preset"
          onClick={() => registry.stepPreset(instanceId, -1)}
        >
          <ChevronLeftIcon />
        </Button>
        <div className={styles.cardPresetDots}>
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              className={styles.cardPresetDot}
              data-active={i === index || undefined}
              disabled={count <= 1}
              title={i === 0 ? "Default settings" : `Preset ${i} of ${count - 1}`}
              aria-label={
                i === 0 ? "Show default settings" : `Show preset ${i}`
              }
              onClick={() => registry.selectPreset(instanceId, i)}
            />
          ))}
        </div>
        <Button
          variant="icon"
          size="sm"
          disabled={count <= 1}
          title="Next preset"
          aria-label="Next preset"
          onClick={() => registry.stepPreset(instanceId, 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
