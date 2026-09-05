import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { WidgetDefinition } from "../../../registry/defRegistry";
import { RenderWidget } from "../../../widgets/widget";
import styles from "../styles/rail.module.css";
import { PreviewInstanceRegistry } from "./previewRegistry";


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
          observer.disconnect(); // TODO: maybe remain observing to hide the preview when scrolled out of view? possibly add timeout so scrolling in and out doesn't thrash the preview on/off
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
