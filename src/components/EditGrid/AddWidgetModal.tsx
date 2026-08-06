import { PlusCircleIcon } from "@heroicons/react/16/solid";
import { CSSProperties, useState } from "react";
import { Button } from "../../primitives/Button";
import { Input } from "../../primitives/Input";
import { Modal } from "../../primitives/Modal";
import {
  CATEGORIES,
  getAllWidgetDefinitions,
  SelectOptionDef,
  TAGS,
  WidgetDefinition,
  WidgetSettingsDefinition,
} from "../../registry/defRegistry";
import { combineClassNames } from "../../utils/format";
import styles from "./styles/addWidgetModal.module.css";

function optionLabel(opt: string | SelectOptionDef): string {
  return typeof opt === "string" ? opt : opt.label;
}

function primitiveDefault(val: unknown): string | undefined {
  return ["string", "number", "boolean"].includes(typeof val)
    ? String(val as string | number | boolean)
    : undefined;
}

function SettingDescription({
  setting,
}: {
  setting: WidgetSettingsDefinition[string];
}) {
  if (setting.type === "select") {
    const opts = setting.options;
    const labels = Object.values(opts).map(optionLabel).join(" | ");
    const defaultOpt =
      "default" in setting ? opts[setting.default as string] : undefined;
    const defaultStr =
      defaultOpt === undefined ? undefined : optionLabel(defaultOpt);
    const optionsWithSubs = Object.values(opts).filter(
      (v) =>
        typeof v === "object" &&
        v.settings &&
        Object.keys(v.settings).length > 0,
    ) as Required<SelectOptionDef>[];
    return (
      <li className={styles.settingItem}>
        {setting.label}: {labels}
        {defaultStr !== undefined && ` (default: ${defaultStr})`}
        {optionsWithSubs.length > 0 && (
          <ul className={styles.settingsSublist}>
            {optionsWithSubs.map((opt) => (
              <li key={opt.label} className={styles.settingsSubOption}>
                <span className={styles.settingsWhenLabel}>
                  When "{opt.label}":
                </span>
                <ul className={styles.settingsSubItems}>
                  {Object.values(opt.settings).map((sub) => (
                    <SettingDescription key={sub.label} setting={sub} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  const defaultStr =
    "default" in setting ? primitiveDefault(setting.default) : undefined;
  return (
    <li className={styles.settingItem}>
      {setting.label}: {setting.type}
      {defaultStr !== undefined && ` (default: ${defaultStr})`}
    </li>
  );
}

function WidgetEntry({
  def,
  onAdd,
}: {
  def: WidgetDefinition;
  onAdd: (defId: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hasSettings =
    def.settingsDef && Object.keys(def.settingsDef).length > 0;
  return (
    <div className={styles.widgetEntry}>
      <div className={styles.widgetName}>{def.name}</div>
      <div className={styles.widgetCategory}>{CATEGORIES[def.category]}</div>
      <div className={styles.widgetTags}>
        {def.tags?.map((t) => (
          <span
            key={t}
            style={{ "--tag-color": TAGS[t] } as CSSProperties}
            className={styles.widgetTag}
          >
            {t}
          </span>
        ))}
      </div>
      <div className={styles.widgetAddButtonContainer}>
        <Button
          variant="default"
          onClick={() => onAdd(def.id)}
          title="Add widget"
        >
          <PlusCircleIcon />
        </Button>
      </div>
      <div className={styles.widgetDescription}>{def.description}</div>
      {hasSettings && (
        <div className={styles.widgetSettings}>
          <p className={styles.settingsLabel}>
            Available Settings:{" "}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              {settingsOpen ? "Hide" : "Show"}
            </Button>
          </p>
          <ul
            className={combineClassNames(
              styles.settingsList,
              settingsOpen
                ? styles.widgetSettingsOpen
                : styles.widgetSettingsClosed,
            )}
          >
            {Object.values(def.settingsDef).map((s) => (
              <SettingDescription key={s.label} setting={s} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AddWidgetModal({
  onAdd,
  onClose,
}: {
  onAdd: (defId: string) => void;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    keyof typeof CATEGORIES | null
  >(null);
  const [selectedTag, setSelectedTag] = useState<keyof typeof TAGS | null>(
    null,
  );
  const defs = getAllWidgetDefinitions();
  return (
    <Modal
      title="Add widget"
      actions={[
        <Button key="close" variant="ghost_danger" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      <Input
        type="text"
        placeholder="Search widgets…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
        autoFocus
      />
      <div>
        {Object.keys(CATEGORIES).map((cat) => (
          <Button
            key={cat}
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
      </div>
      <div>
        {Object.keys(TAGS).map((tag) => (
          <Button
            key={tag}
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
      <div className={styles.modalList}>
        {
          defs
            .filter(
              (def) =>
                (def.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  def.tags?.some((t) =>
                    t.toLowerCase().includes(searchTerm.toLowerCase()),
                  ) ||
                  def.category
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase())) &&
                (selectedCategory === null ||
                  def.category === selectedCategory) &&
                  //@ts-expect-error applet tag can be filtered on, but typeof def.tags technically disallows it.
                (selectedTag === null || def.tags?.includes(selectedTag)),
            )
            .flatMap((def) => [
              <WidgetEntry key={def.id} def={def} onAdd={onAdd} />,
              <hr key={`${def.id}-hr`} />,
            ])
            .slice(0, -1) /* remove last <hr> */
        }
      </div>
    </Modal>
  );
}
