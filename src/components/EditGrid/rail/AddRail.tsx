import { FunnelIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useMemo, useRef, useState } from "react";
import { useEnterTransition } from "../../../hooks/useEnterTransition";
import { useInterval } from "../../../hooks/useInterval";
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
import {
  PreviewInstanceRegistry,
  PRESET_INTERVAL_MS,
} from "./previewRegistry";
import { previewInstanceId } from "../../../preview/previewIds";
import { defaultSettingsForWidget } from "../../../registry/settingsDefaults";

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
  
  noSpace: boolean;
  /** `settings` is the preset the card was showing when it was picked. */
  onPick: (defId: string, settings: Record<string, any> | undefined) => void;
  onGhostMove: (defId: string, clientX: number, clientY: number) => void;
  onDrop: (
    defId: string,
    clientX: number,
    clientY: number,
    settings: Record<string, any> | undefined,
  ) => void;
  onGhostCancel: () => void;
  onRequestClose: () => void;
  onExited: () => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const { shown, finishExit } = useEnterTransition(open, 350, onExited);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<
    keyof typeof CATEGORIES | null
  >(null);
  const [selectedTag, setSelectedTag] = useState<keyof typeof TAGS | null>(
    null,
  );

  // Built from the whole catalog, not the filtered `defs` below: filtering
  // decides what gets *rendered*, and rebuilding the registry per keystroke
  // would remount every card (losing its IntersectionObserver state and its
  // place in the preset cycle) each time the search box changed.
  const registry = useMemo(() => {
    const r = new PreviewInstanceRegistry();
    for (const def of getAllWidgetDefinitions()) {
      r.add(
        previewInstanceId(def.id),
        def.id,
        { col: 1, row: 1, col_span: 1, row_span: 1 },
        defaultSettingsForWidget(def.id),
      );
    }
    return r;
  }, []);

  function currentPreset(defId: string): Record<string, any> | undefined {
    return registry.currentSettings(previewInstanceId(defId));
  }

  const {
    placing,
    handleCardPointerDown,
    handleCardPointerMove,
    handleCardPointerUp,
    handleCardPointerCancel,
  } = useRailDrag({
    railRef,
    // useRailDrag only knows the definition id; which preset a card is showing
    // is the rail's own business, so it's read off the registry here rather
    // than threaded through the drag hook.
    onClick: (defId) => onPick(defId, currentPreset(defId)),
    onGhostMove,
    onDrop: (defId, x, y) => onDrop(defId, x, y, currentPreset(defId)),
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

  useInterval(() => registry.advanceAll(), open ? PRESET_INTERVAL_MS : null);

  return (
    <div
      ref={railRef}
      className={styles.rail}
      style={{ width }}
      data-open={shown || undefined}
      data-placing={placing || undefined}
      onTransitionEnd={(e) => {
        if (!open && e.target === railRef.current) finishExit();
      }}
    >
      <div className={styles.railHeader}>
        <Input
          type="text"
          placeholder="Search widgets..."
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
          No space for this widget on the grid. Move or resize existing widgets to make room.
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
              registry={registry}
              instanceId={previewInstanceId(def.id)}
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
