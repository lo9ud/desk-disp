import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { WidgetDefinition } from "../../../registry/defRegistry";
import { InstanceRegistry } from "../../../registry/instanceRegistry";
import { defaultSettingsForWidget } from "../../../registry/settingsDefaults";
import { previewInstanceId } from "../../../preview/previewIds";
import { RenderWidget } from "../../../widgets/widget";
import styles from "../styles/rail.module.css";

/**
 * Live widget render for a gallery card, fed mocked data. Mounted only once
 * the card scrolls into view so a large catalog doesn't spin up dozens of
 * animated widgets at once.
 */
export function CardPreview({ def }: { def: WidgetDefinition }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100%" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  // Throwaway registry per card: never touches the canonical or edit
  // registries, and the "preview:" id keeps persistence in memory.
  const registry = useMemo(() => {
    const r = new InstanceRegistry();
    r.add(
      previewInstanceId(def.id),
      def.id,
      { col: 1, row: 1, col_span: 1, row_span: 1 },
      defaultSettingsForWidget(def.id),
    );
    return r;
  }, [def.id]);

  return (
    <div ref={ref} className={styles.cardPreview}>
      {visible ? (
        <ErrorBoundary
          fallback={<span className={styles.previewFallback}>No preview</span>}
        >
          <RenderWidget
            instanceId={previewInstanceId(def.id)}
            registry={registry}
          />
        </ErrorBoundary>
      ) : (
        <span className={styles.previewFallback}>{def.name}</span>
      )}
    </div>
  );
}
