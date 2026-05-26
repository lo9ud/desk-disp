import { PauseIcon } from "@heroicons/react/24/solid";
import { useSubscription } from "../../hooks";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";
import styles from "./styles/AlbumArtWidget.module.css";
import { combineClassNames } from "../../utils/format";

const ALBUM_ART_WIDGET_SETTINGS_DEF = {
  style: {
    type: "select",
    label: "Style",
    options: {
      square: "Square",
      rounded: "Rounded",
      circle: {
        label: "Circle",
        settings: {
          rotate: {
            type: "boolean",
            label: "Rotate when playing",
          },
        },
      },
    },
    default: "rounded",
  },
  filterBlur: {
    type: "boolean",
    label: "Border blur",
  },
  filterLightness: {
    type: "select",
    label: "Border lightness",
    options: {
      none: "None",
      lighten: "Lighten",
      darken: "Darken",
    },
    default: "none",
    enableWhen: { key: "filterBlur", is: true },
  },
  filterSaturation: {
    type: "select",
    label: "Border saturation",
    options: {
      max: "Max",
      boost: "Boost",
      normal: "Normal",
      reduced: "Reduced",
      none: "None",
    },
    default: "none",
    enableWhen: { key: "filterBlur", is: true },
  },
} satisfies WidgetSettingsDefinition;

export function AlbumArt({
  style,
  rotate,
  filterBlur,
  filterLightness,
  filterSaturation,
}: WidgetSettingsProps<typeof ALBUM_ART_WIDGET_SETTINGS_DEF>) {
  const { data } = useSubscription("media");
  const albumArtSrc =
    data?.album_art_b64 && `data:image/jpeg;base64,${data?.album_art_b64}`;
  const playing = data?.playing ?? !data?.active;
  const pausedStyle = playing ? null : styles.paused;
  const rotateStyle = rotate && style === "circle" ? styles.rotate : null;
  const shapeStyle = {
    square: styles.square,
    rounded: styles.rounded,
    circle: styles.circle,
  }[style];
  const blurStyle = filterBlur ? styles.blurActive : null;
  const lightnessStyle = {
    none: undefined,
    lighten: styles.lighten,
    darken: styles.darken,
  }[filterLightness];
  const saturationStyle = {
    max: styles.satMax,
    boost: styles.satBoost,
    normal: null,
    reduced: styles.greyPartial,
    none: styles.greyFull,
  }[filterSaturation];
  return (
    <div className={styles.container}>
      {albumArtSrc && (
        <>
          {filterBlur && (
            <img
              className={combineClassNames(
                styles.blur,
                pausedStyle,
                rotateStyle,
                shapeStyle,
                blurStyle,
                lightnessStyle,
                saturationStyle,
              )}
              alt="Currently playing album art (blurred)"
              src={albumArtSrc}
            />
          )}
          <img
            className={combineClassNames(
              styles.art,
              pausedStyle,
              rotateStyle,
              shapeStyle,
            )}
            alt="Currently playing album art (main image)"
            src={albumArtSrc}
          />
        </>
      )}
      {!playing && <PauseIcon className={styles.pause} />}
    </div>
  );
}

const AlbumArtWidget = registerWidget(AlbumArt, {
  id: "album_art",
  name: "Album Art",
  description: "Shows the current track's album art",
  category: "media",
  tags: [],
  settingsDef: ALBUM_ART_WIDGET_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});

export default AlbumArtWidget;
