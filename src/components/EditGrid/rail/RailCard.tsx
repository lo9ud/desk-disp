import { CSSProperties } from "react";
import {
  CATEGORIES,
  TAGS,
  WidgetDefinition,
} from "../../../registry/defRegistry";
import styles from "../styles/rail.module.css";
import { CardPreview } from "./CardPreview";

export function RailCard({
  def,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  def: WidgetDefinition;
  onPointerDown: (e: React.PointerEvent, defId: string) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
}) {
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
      <CardPreview def={def} />
    </div>
  );
}
