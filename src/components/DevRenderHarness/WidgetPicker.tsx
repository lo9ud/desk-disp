import { CSSProperties, useMemo, useState } from "react";
import { FunnelIcon } from "@heroicons/react/16/solid";
import { Button } from "../../primitives/Button";
import { Input } from "../../primitives/Input";
import {
  CATEGORIES,
  getAllWidgetDefinitions,
  TAGS,
  WidgetDefinition,
} from "../../registry/defRegistry";
import styles from "./styles/DevRenderHarness.module.css";

type Category = keyof typeof CATEGORIES;
type Tag = keyof typeof TAGS;

function matches(def: WidgetDefinition, q: string): boolean {
  if (!q) return true;
  return (
    def.name.toLowerCase().includes(q) ||
    def.id.toLowerCase().includes(q) ||
    def.description.toLowerCase().includes(q) ||
    CATEGORIES[def.category].toLowerCase().includes(q) ||
    def.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function WidgetPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [tag, setTag] = useState<Tag | null>(null);

  const all = getAllWidgetDefinitions();
  const q = query.toLowerCase().trim();

  const groups = useMemo(() => {
    const hits = all.filter(
      (def) =>
        matches(def, q) &&
        (category === null || def.category === category) &&
        (tag === null || (def.tags as readonly string[]).includes(tag)),
    );
    return (Object.keys(CATEGORIES) as Category[])
      .map((cat) => ({ cat, defs: hits.filter((d) => d.category === cat) }))
      .filter(({ defs }) => defs.length > 0);
  }, [q, category, tag]);

  const ordered = groups.flatMap(({ defs }) => defs.map((d) => d.id));

  function step(delta: number) {
    if (ordered.length === 0) return;
    const at = selectedId ? ordered.indexOf(selectedId) : -1;
    const next =
      at === -1
        ? delta > 0
          ? 0
          : ordered.length - 1
        : (at + delta + ordered.length) % ordered.length;
    onSelect(ordered[next]);
  }

  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeader}>
        <Input
          type="text"
          placeholder="Search widgets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.searchInput}
          autoFocus
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            step(e.key === "ArrowDown" ? 1 : -1);
          }}
        />
        <Button
          variant={filtersOpen ? "icon_accent" : "icon"}
          title="Filters"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <FunnelIcon />
        </Button>
      </div>

      {filtersOpen && (
        <div className={styles.filters}>
          {(Object.keys(CATEGORIES) as Category[]).map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={category === cat ? "accent" : "default"}
              onClick={() => setCategory(category === cat ? null : cat)}
            >
              {CATEGORIES[cat]}
            </Button>
          ))}
          {(Object.keys(TAGS) as Tag[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tag === t ? "accent" : "default"}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </Button>
          ))}
        </div>
      )}

      <div className={styles.pickerCount}>
        {ordered.length} of {all.length} widgets
      </div>

      <div className={styles.pickerList}>
        {groups.map(({ cat, defs }) => (
          <div key={cat} className={styles.pickerGroup}>
            <div className={styles.pickerGroupLabel}>{CATEGORIES[cat]}</div>
            {defs.map((def) => (
              <button
                key={def.id}
                type="button"
                className={styles.pickerItem}
                data-selected={def.id === selectedId || undefined}
                title={def.description}
                onClick={() => onSelect(def.id)}
              >
                <span className={styles.pickerItemName}>{def.name}</span>
                {def.tags.length > 0 && (
                  <span className={styles.pickerItemTags}>
                    {def.tags.map((t) => (
                      <span
                        key={t}
                        className={styles.tag}
                        style={{ "--tag-color": TAGS[t] } as CSSProperties}
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
        {ordered.length === 0 && (
          <div className={styles.empty}>No widgets match.</div>
        )}
      </div>
    </div>
  );
}
