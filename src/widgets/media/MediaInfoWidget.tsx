import { useSubscription } from "../../hooks";
import { registerWidget } from "../../registry/defRegistry";
import styles from "./styles/MediaInfoWidget.module.css";

export function MediaInfo() {
  const { data } = useSubscription("media");

  if (!data?.active) {
    return (
      <div className={styles.container}>
        <span></span>
        <span className={styles.inactive}>Nothing playing</span>
        <span></span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <span className={styles.title}>{data.title}</span>
      <span className={styles.album}>{data.album}</span>
      <span className={styles.artist}>{data.artist}</span>
    </div>
  );
}

const MediaInfoWidget = registerWidget(MediaInfo, {
  id: "media_info",
  name: "Media Info",
  description: "Shows the current track title, album, and artist",
  category: "media",
  tags: [],
  settingsDef: {},
  minSize: [null, null],
  maxSize: [null, null],
});

export default MediaInfoWidget;
