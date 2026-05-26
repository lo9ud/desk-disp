import { registerWidget, WidgetSettingsDefinition, WidgetSettingsProps } from "../../registry/defRegistry";
import { MediaControls } from "./MediaControlsWidget";
import { MediaInfo } from "./MediaInfoWidget";
import { MediaProgress } from "./MediaProgressWidget";
import styles from "./styles/MediaDetailWidget.module.css";

const MEDIA_DETAIL_SETTINGS_DEF = {
  showControls: {
    label: "Show Media Controls",
    type: "boolean",
    default: true,
  }
} satisfies WidgetSettingsDefinition;

export function MediaDetail({
  showControls,
}: WidgetSettingsProps<typeof MEDIA_DETAIL_SETTINGS_DEF>) {
  return (
    <div className={styles.container}>
      <MediaInfo />
      <MediaProgress />
      {showControls && <MediaControls />}
    </div>
  );
}

const MediaDetailWidget = registerWidget(MediaDetail, {
  id: "media_detail",
  name: "Media Detail",
  description: "Shows media info, progress bar, and playback controls",
  settingsDef: MEDIA_DETAIL_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
  category: "media",
  tags: ["customizable"],
});

export default MediaDetailWidget;
