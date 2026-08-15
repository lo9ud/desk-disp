import { FunnelIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../primitives/Button";
import { Input } from "../../../primitives/Input";
import {
  CATEGORIES,
  getAllWidgetDefinitions,
  TAGS,
} from "../../../registry/defRegistry";
import { PreviewEnvironment } from "../../../preview/PreviewEnvironment";
import styles from "../styles/rail.module.css";
import { RailCard } from "./RailCard";
import { useRailDrag } from "./useRailDrag";

export function AddRail({
  open,
  width,
  noSpace,
  onPick,
  onGhostMove,
  onDrop,
  onGhostCancel,
  onRequestClose,
  onExited,
}: {
  open: boolean;
  width: number;
  /** Transient "no space" flag from a failed click-to-place. */
  noSpace: boolean;
  onPick: (defId: string) => void;
  onGhostMove: (defId: string, clientX: number, clientY: number) => void;
  onDrop: (defId: string, clientX: number, clientY: number) => void;
  onGhostCancel: () => void;
  onRequestClose: () => void;
  onExited: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<
    keyof typeof CATEGORIES | null
  >(null);
  const [selectedTag, setSelectedTag] = useState<keyof typeof TAGS | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setShown(false);
      // transitionend is the normal exit path; this covers it not firing.
      const t = window.setTimeout(onExited, 350);
      return () => window.clearTimeout(t);
    }
    // Double rAF so the closed position is committed before the slide-in.
    let raf2: number;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const {
    placing,
    handleCardPointerDown,
    handleCardPointerMove,
    handleCardPointerUp,
    handleCardPointerCancel,
  } = useRailDrag({
    railRef,
    onClick: onPick,
    onGhostMove,
    onDrop,
    onGhostCancel,
  });

  const q = searchTerm.toLowerCase();
  const defs = getAllWidgetDefinitions().filter(
    (def) =>
      (def.name.toLowerCase().includes(q) ||
        def.tags?.some((t) => t.toLowerCase().includes(q)) ||
        def.category.toLowerCase().includes(q)) &&
      (selectedCategory === null || def.category === selectedCategory) &&
      //@ts-expect-error applet tag can be filtered on, but typeof def.tags technically disallows it.
      (selectedTag === null || def.tags?.includes(selectedTag)),
  );

  return (
    <div
      ref={railRef}
      className={styles.rail}
      style={{ width }}
      data-open={shown || undefined}
      data-placing={placing || undefined}
      onTransitionEnd={(e) => {
        if (!open && e.target === railRef.current) onExited();
      }}
    >
      <div className={styles.railHeader}>
        <Input
          type="text"
          placeholder="Search widgets…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onRequestClose();
            }
          }}
        />
        <Button
          variant={filtersOpen ? "icon_accent" : "icon"}
          title="Filters"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <FunnelIcon />
        </Button>
        <Button variant="icon" title="Close" onClick={onRequestClose}>
          <XMarkIcon />
        </Button>
      </div>

      {filtersOpen && (
        <div className={styles.filters}>
          {Object.keys(CATEGORIES).map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? "accent" : "default"}
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === cat
                    ? null
                    : (cat as keyof typeof CATEGORIES),
                )
              }
            >
              {CATEGORIES[cat as keyof typeof CATEGORIES]}
            </Button>
          ))}
          {Object.keys(TAGS).map((tag) => (
            <Button
              key={tag}
              size="sm"
              variant={selectedTag === tag ? "accent" : "default"}
              onClick={() =>
                setSelectedTag(
                  selectedTag === tag ? null : (tag as keyof typeof TAGS),
                )
              }
            >
              {tag}
            </Button>
          ))}
        </div>
      )}

      {noSpace && (
        <div className={styles.noSpace}>
          No free cell for this widget — drag it onto the grid or make room
          first.
        </div>
      )}

      {/* One environment for the whole gallery: cards share the mock hub, so
          each stream ticks once for all its previews and stops when the last
          one unmounts (the rail closing). */}
      <PreviewEnvironment>
        <div className={styles.cards}>
          {defs.map((def) => (
            <RailCard
              key={def.id}
              def={def}
              onPointerDown={handleCardPointerDown}
              onPointerMove={handleCardPointerMove}
              onPointerUp={handleCardPointerUp}
              onPointerCancel={handleCardPointerCancel}
            />
          ))}
          {defs.length === 0 && (
            <div className={styles.noResults}>No widgets match.</div>
          )}
        </div>
      </PreviewEnvironment>
    </div>
  );
}
