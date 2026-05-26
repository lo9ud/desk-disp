import { registerWidget } from "../../registry/defRegistry";
import styles from "./styles/MediaControlsWidget.module.css";
import { useSubscription } from "../../hooks";
import {
  BackwardIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { ipc } from "../../ipc";

export function MediaControls() {
  const { data } = useSubscription("media");
  const active = data?.active ?? false;
  const playing = data?.playing ?? null;
  return (
    <div className={styles.container}>
      <button disabled={!active} className={styles.control} onClick={(_) => ipc.prevTrack()}>
        <BackwardIcon />
      </button>
      <button disabled={!active} className={styles.control} onClick={(_) => ipc.togglePlayback()}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button disabled={!active} className={styles.control} onClick={(_) => ipc.nextTrack()}>
        <ForwardIcon />
      </button>
    </div>
  );
}

const MediaControlsWidget = registerWidget(MediaControls, {
  id: "media_controls",
  name: "Media Controls",
  description: "Playback controls for the current media session",
  category: "media",
  settingsDef: {},
  tags: ["interactive"],
  minSize: [null, null],
  maxSize: [null, null],
});

export default MediaControlsWidget;
