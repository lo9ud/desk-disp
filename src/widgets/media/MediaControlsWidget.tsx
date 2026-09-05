import { registerWidget } from "../../registry/defRegistry";
import styles from "./styles/MediaControlsWidget.module.css";
import { useSubscription } from "../../runtime";
import {
  BackwardIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { useWidgetApi } from "../../runtime/context";

export function MediaControls() {
  const { media } = useWidgetApi();
  const { data } = useSubscription("media");
  const active = data?.active ?? false;
  const playing = data?.playing ?? null;
  return (
    <div className={styles.container}>
      <button disabled={!active} className={styles.control} onClick={(_) => media.previous()}>
        <BackwardIcon />
      </button>
      <button disabled={!active} className={styles.control} onClick={(_) => media.toggle()}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button disabled={!active} className={styles.control} onClick={(_) => media.next()}>
        <ForwardIcon />
      </button>
    </div>
  );
}

registerWidget(MediaControls, {
  id: "media_controls",
  name: "Media Controls",
  description: "Playback controls for the current media session",
  category: "media",
  settingsDef: {},
  tags: ["interactive"],
  minSize: [null, null],
  maxSize: [null, null],
});
