import { useEffect, useRef } from "react";
import { registerWidget } from "../../registry/defRegistry";
import { useSubscription } from "../../hooks";
import styles from "./styles/MediaProgressWidget.module.css";
import { formatMs } from "../../utils/format";

export function MediaProgress() {
  const { data } = useSubscription("media");

  const { position_ms, duration_ms, playing, title } = data || {};

  const barRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const duration = Number(duration_ms);

  // Recreate animation on track change (title guards same-duration tracks)
  useEffect(() => {
    if (!barRef.current || !duration || duration <= 0) return;
    animRef.current?.cancel();
    animRef.current = barRef.current.animate(
      [{ width: "0%" }, { width: "100%" }],
      { duration, fill: "forwards" },
    );
    animRef.current.currentTime = Number(position_ms);
    playing ? animRef.current.play() : animRef.current.pause();
    return () => {
      animRef.current?.cancel();
      animRef.current = null;
    };
  }, [duration, title]);

  function resync() {
    if (!animRef.current) return;
    const t = animRef.current.currentTime;
    if (typeof t === "number" && Math.abs(t - Number(position_ms)) > 250) {
      animRef.current.currentTime = Number(position_ms);
    }
  }

  // Resync only if drifted beyond threshold
  useEffect(() => {
    if (!animRef.current) return;
    resync();
  }, [position_ms]);

  // Sync play/pause state
  useEffect(() => {
    if (!animRef.current) return;
    playing ? animRef.current.play() : animRef.current.pause();
  }, [playing]);

  return (
    <div className={styles.progressContainer}>
      <div className={styles.timeContainer}>
        <span className={styles.elapsed}>{formatMs(Number(position_ms))}</span>
        <span className={styles.duration}>{formatMs(duration)}</span>
      </div>
      <div className={styles.barContainer}>
        <div ref={barRef} className={styles.bar} />
      </div>
    </div>
  );
}

const MediaProgressWidget = registerWidget(MediaProgress, {
  id: "media_progress",
  name: "Media Progress",
  description: "Shows the current track's playback progress",
  category: "media",
  tags: [],
  settingsDef: {},
  minSize: [null, null],
  maxSize: [null, null],
});

export default MediaProgressWidget;
