import { useEffect, useRef, useState } from "react";
import { useStat } from "../hooks";
import { Metadata } from "../types";
import { getAlbumArtHiRes, getMediaMetadata } from "../utils";
import { WidgetProps } from "./Widget";

import styles from "./styles/MediaInfo.module.css";

export default function MediaInfo({
  col,
  row,
  colSpan,
  rowSpan,
}: Readonly<WidgetProps>) {
  const [highResAlbumArt, setHighResAlbumArt] = useState<string | null>(null);
  const oldMediaMetadata = useRef<Metadata | null>(null);
  const mediaMetadata = useStat<Metadata, Metadata | null>(
    getMediaMetadata,
    async (v) => v,
    [],
    200
  );

  useEffect(() => {
    if (
      mediaMetadata &&
      (!oldMediaMetadata.current ||
        mediaMetadata.title !== oldMediaMetadata.current.title)
    ) {
      getAlbumArtHiRes(mediaMetadata.title, mediaMetadata.artist).then(
        setHighResAlbumArt
      );
      oldMediaMetadata.current = mediaMetadata;
    }
  }, [mediaMetadata]);

  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };

  const artSrc =
    highResAlbumArt ??
    "data:image/jpeg;base64," + (mediaMetadata?.album_art ?? "");

  return (
    <div className={styles.mediaInfo} style={style}>
      {mediaMetadata?.album_art && (
        <div className={styles.artworkContainer}>
          <div className={styles.artworkWrapper}>
            <img
              src={artSrc}
              alt={mediaMetadata.title}
              className={styles.artwork}
            />
            <img
              src={artSrc}
              alt={mediaMetadata.title}
              className={styles.artworkBlur}
            />
          </div>
        </div>
      )}
      <span className={styles.title}>{mediaMetadata?.title}</span>
      <span className={styles.album}>{mediaMetadata?.album}</span>
      <span className={styles.artist}>{mediaMetadata?.artist}</span>
    </div>
  );
}
