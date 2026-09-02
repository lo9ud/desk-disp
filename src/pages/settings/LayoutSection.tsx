import { useCallback, useEffect, useRef, useState } from "react";
import { useRuntime } from "../../runtime/context";
import type { LayoutInfo } from "../../ffi_types";

import styles from "./styles/LayoutSection.module.css";
import pageStyles from "./styles/Settings.module.css";
import { Button } from "../../primitives/Button";
import { Separator } from "../../primitives/Separator";
import {
  DocumentDuplicateIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { logger } from "../../utils/logger";

const {error} = logger("layout-section");

export default function LayoutSection() {
  const runtime = useRuntime();
  const [layouts, setLayouts] = useState<LayoutInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadLayouts = useCallback(async () => {
    const list = await runtime.layouts.list();
    setLayouts(list);
  }, []);

  useEffect(() => {
    runtime.config.get().then((cfg) => {
      setActiveId(cfg.active_layout ?? null);
    });
    loadLayouts();
  }, [loadLayouts]);

  async function handleSelect(id: string) {
    setActiveId(id);
    await runtime.layouts.setActive(id);
  }

  async function handleDuplicate(id: string) {
    try {
      const layout = await runtime.layouts.get(id);
      const source = layouts.find((l) => l.id === id);
      const newId = crypto.randomUUID();
      const newName = `${source?.name ?? id} (Copy)`;
      await runtime.layouts.save(newId, { ...layout, id: newId, name: newName });
      await loadLayouts();
    } catch (e) {
      error("Duplicate failed:", e?.toString());
    }
  }

  async function handleDelete(id: string) {
    try {
      await runtime.layouts.delete(id);
      await loadLayouts();
      if (activeId === id) {
        const fallback = layouts.find((l) => l.id !== id)?.id ?? null;
        setActiveId(fallback);
        await runtime.layouts.setActive(fallback);
      }
    } catch (e) {
      error("Delete failed:", e?.toString());
    }
  }

  function handleRenameStart(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(layouts.find((l) => l.id === id)?.name ?? "");
    requestAnimationFrame(() => renameInputRef.current?.select());
  }

  async function handleRenameConfirm(id: string) {
    const trimmed = renameValue.trim();
    const current = layouts.find((l) => l.id === id)?.name;
    if (trimmed && trimmed !== current) {
      try {
        const newId = await runtime.layouts.rename(id, trimmed);
        if (activeId === id) setActiveId(newId);
        await loadLayouts();
      } catch (e) {
        error("Rename failed:", e?.toString());
      }
    }
    setRenamingId(null);
  }

  async function handleRestoreDefaults() {
    if (!confirm("Restore built-in layouts? Custom layouts will not be affected.")) return;
    await runtime.themes.restoreDefaults();
    await loadLayouts();
  }

  return (
    <section className={pageStyles.section}>
      <Separator />

      <div className={styles.layoutListActions}>
        <span className={styles.layoutListTitle}>Available Layouts</span>
        <div>
          <Button variant="ghost" onClick={loadLayouts} title="Refresh layout list">↺</Button>
          <Button variant="ghost" onClick={() => runtime.layouts.openFolder()}>Open Folder</Button>
          <Button variant="ghost_danger" onClick={handleRestoreDefaults}>Restore Defaults</Button>
        </div>
      </div>

      <ul className={styles.layoutList}>
        {layouts.map((layout) => {
          const isActive = layout.id === activeId;
          const isRenaming = renamingId === layout.id;
          return (
            <li
              key={layout.id}
              className={`${styles.layoutItem} ${isActive ? styles.active : ""}`}
              onClick={() => !isRenaming && handleSelect(layout.id)}
            >
              <span className={styles.layoutItemIndicator} />
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className={styles.renameInput}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameConfirm(layout.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameConfirm(layout.id);
                    if (e.key === "Escape") setRenamingId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className={styles.layoutItemName}>{layout.name}</span>
              )}
              <span className={styles.layoutItemActions}>
                <Button
                  variant="ghost"
                  title="Duplicate"
                  onClick={(e) => { e.stopPropagation(); handleDuplicate(layout.id); }}
                >
                  <DocumentDuplicateIcon />
                </Button>
                <Button
                  variant="ghost"
                  title="Rename"
                  onClick={(e) => handleRenameStart(layout.id, e)}
                >
                  <PencilSquareIcon />
                </Button>
                <Button
                  variant="ghost_danger"
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); handleDelete(layout.id); }}
                >
                  <XMarkIcon />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
