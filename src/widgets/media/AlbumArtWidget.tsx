import { PauseIcon } from "@heroicons/react/24/solid";
import { useSubscription } from "../../runtime";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";
import styles from "./styles/AlbumArtWidget.module.css";
import { combineClassNames } from "../../utils/format";
import { imageDataUrl } from "../../utils/image";

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
            default: false,
          },
          speed: {
            type: "select",
            label: "Rotation speed",
            options: {
              slow: "Slow",
              medium: "Medium",
              fast: "Fast",
            },
            default: "slow",
            showWhen: { key: "rotate", is: true },
          },
        },
      },
    },
    default: "square",
  },
  filterGlow: {
    type: "boolean",
    label: "Border glow",
    default: false,
  },
  filterLightness: {
    type: "select",
    label: "Glow lightness",
    options: {
      none: "None",
      lighten: "Lighten",
      darken: "Darken",
    },
    default: "none",
    enableWhen: { key: "filterGlow", is: true },
  },
  filterSaturation: {
    type: "select",
    label: "Glow saturation",
    options: {
      max: "Max",
      boost: "Boost",
      normal: "Normal",
      reduced: "Reduced",
    },
    default: "normal",
    enableWhen: { key: "filterGlow", is: true },
  },
} satisfies WidgetSettingsDefinition;

export function AlbumArt({
  style,
  speed,
  rotate,
  filterGlow,
  filterLightness,
  filterSaturation,
}: WidgetSettingsProps<typeof ALBUM_ART_WIDGET_SETTINGS_DEF>) {
  const { data } = useSubscription("media");
  // Type sniffed from the payload, not assumed: see imageDataUrl's note.
  const albumArtSrc = data?.album_art_b64
    ? imageDataUrl(data.album_art_b64)
    : null;
  const playing = data?.playing ?? !data?.active;
  const pausedStyle = playing ? null : styles.paused;
  const rotateStyle = rotate && style === "circle" ? styles.rotate : null;
  const shapeStyle = {
    square: styles.square,
    rounded: styles.rounded,
    circle: styles.circle,
  }[style];
  const glowStyle = filterGlow ? styles.glowActive : null;
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
  }[filterSaturation];
  const speedStyle = {
    slow: styles.slow,
    medium: null,
    fast: styles.fast,
  }[speed];
  return (
    <div className={styles.container}>
      {albumArtSrc && (
        <>
          {filterGlow && (
            <img
              className={combineClassNames(
                styles.glow,
                pausedStyle,
                rotateStyle,
                speedStyle,
                shapeStyle,
                glowStyle,
                lightnessStyle,
                saturationStyle,
              )}
              alt="Currently playing album art (glowred)"
              src={albumArtSrc}
            />
          )}
          <img
            className={combineClassNames(
              styles.art,
              pausedStyle,
              rotateStyle,
              speedStyle,
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
  // The gallery's variety for this widget comes from here rather than from the
  // media stream: the mock tracks rotate far too slowly to change during a
  // browse, by design (see MOCK_STREAMS.media).
  presetsSettings: [
    {
      filterGlow: true,
      filterLightness: "darken",
      filterSaturation: "reduced",
    },
    {
      style: "rounded",
      filterGlow: true,
      filterLightness: "lighten",
      filterSaturation: "boost",
    },
    { style: "circle", rotate: true, speed: "slow" },
    { filterGlow: true, filterSaturation: "max" },
    {
      style: "circle",
      rotate: true,
      speed: "medium",
      filterGlow: true,
      filterLightness: "lighten",
      filterSaturation: "boost",
    },
  ],
});

export default AlbumArtWidget;
