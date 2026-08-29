import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { WidgetDefinition } from "../../../registry/defRegistry";
import { RenderWidget } from "../../../widgets/widget";
import styles from "../styles/rail.module.css";
import { PreviewInstanceRegistry } from "./previewRegistry";

/**
 * Live widget render for a gallery card, fed mocked data. Mounted only once
 * the card scrolls into view so a large catalog doesn't spin up dozens of
 * animated widgets at once.
 *
 * The instance lives in the rail's shared PreviewInstanceRegistry rather than
 * in a per-card throwaway one, so the rail can drive every card's preset
 * through a single registry it holds.
 */
export function CardPreview({
  registry,
  def,
  instanceId,
}: {
  registry: PreviewInstanceRegistry;
  def: WidgetDefinition;
  instanceId: string;
}) {
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

  return (
    <div ref={ref} className={styles.cardPreview}>
      {visible ? (
        <ErrorBoundary
          fallback={<span className={styles.previewFallback}>No preview</span>}
        >
          <RenderWidget instanceId={instanceId} registry={registry} />
        </ErrorBoundary>
      ) : (
        <span className={styles.previewFallback}>{def.name}</span>
      )}
    </div>
  );
}
