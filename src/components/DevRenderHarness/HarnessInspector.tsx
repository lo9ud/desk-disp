import { CSSProperties, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { Button } from "../../primitives/Button";
import {
  CATEGORIES,
  TAGS,
  WidgetDefinition,
} from "../../registry/defRegistry";
import {
  collectDefaults,
  presetSettingsForWidget,
} from "../../registry/settingsDefaults";
import { SettingsForm, useEphemeralValues } from "../WidgetSettingsPanel";
import { logger } from "../../utils/logger";
import styles from "./styles/DevRenderHarness.module.css";

const { warn } = logger("dev-render-harness");

type JsonView = "settings" | "preset";

function sizeText(size: [number | null, number | null]): string {
  const [w, h] = size;
  return `${w ?? "—"} × ${h ?? "—"}`;
}

function presetDiff(
  def: WidgetDefinition,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const defaults = collectDefaults(def.settingsDef);
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value !== defaults[key]) diff[key] = value;
  }
  return diff;
}

export function HarnessInspector({
  def,
  settings,
  onChange,
  onReplace,
}: {
  def: WidgetDefinition;
  settings: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReplace: (settings: Record<string, unknown>) => void;
}) {
  const { ephemeral, setEphemeral } = useEphemeralValues();
  const [presetIndex, setPresetIndex] = useState(0);
  const [jsonView, setJsonView] = useState<JsonView>("preset");

  const hasSettings = Object.keys(def.settingsDef).length > 0;
  // Index 0 is the widget's own defaults, as in the add rail's stepper; the
  // declared list starts at 1.
  const presetCount = 1 + (def.presetsSettings?.length ?? 0);

  function applyPreset(index: number) {
    const at = ((index % presetCount) + presetCount) % presetCount;
    setPresetIndex(at);
    const defaults = collectDefaults(def.settingsDef);
    onReplace(
      at === 0
        ? defaults
        : { ...defaults, ...presetSettingsForWidget(def.id, at - 1) },
    );
  }

  const json = JSON.stringify(
    jsonView === "settings" ? settings : presetDiff(def, settings),
    null,
    2,
  );

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      warn("Clipboard write failed; select the JSON block instead", String(e));
    }
  }

  return (
    <div className={styles.inspector}>
      <div className={styles.meta}>
        <div className={styles.metaTitle}>{def.name}</div>
        <div className={styles.metaTags}>
          <span className={styles.metaCategory}>
            {CATEGORIES[def.category]}
          </span>
          {def.tags.map((t) => (
            <span
              key={t}
              className={styles.tag}
              style={{ "--tag-color": TAGS[t] } as CSSProperties}
            >
              {t}
            </span>
          ))}
        </div>
        <div className={styles.metaDesc}>{def.description}</div>
        <dl className={styles.metaFacts}>
          <dt>id</dt>
          <dd className={styles.mono}>{def.id}</dd>
          <dt>min size</dt>
          <dd>{sizeText(def.minSize)}</dd>
          <dt>max size</dt>
          <dd>{sizeText(def.maxSize)}</dd>
          <dt>settings</dt>
          <dd>{Object.keys(def.settingsDef).length}</dd>
        </dl>
      </div>

      <div className={styles.presets}>
        <Button
          variant="icon"
          size="sm"
          disabled={presetCount <= 1}
          title="Previous preset"
          aria-label="Previous preset"
          onClick={() => applyPreset(presetIndex - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <div className={styles.presetDots}>
          {Array.from({ length: presetCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={styles.presetDot}
              data-active={i === presetIndex || undefined}
              title={i === 0 ? "Default settings" : `Preset ${i}`}
              aria-label={i === 0 ? "Show defaults" : `Show preset ${i}`}
              onClick={() => applyPreset(i)}
            />
          ))}
        </div>
        <Button
          variant="icon"
          size="sm"
          disabled={presetCount <= 1}
          title="Next preset"
          aria-label="Next preset"
          onClick={() => applyPreset(presetIndex + 1)}
        >
          <ChevronRightIcon />
        </Button>
        <span className={styles.readoutMuted}>
          {presetIndex === 0
            ? "defaults"
            : `presetsSettings[${presetIndex - 1}]`}
        </span>
      </div>

      <div className={styles.inspectorScroll}>
        {hasSettings ? (
          <SettingsForm
            title="Settings (all conditions revealed)"
            schema={def.settingsDef}
            values={settings}
            ephemeral={ephemeral}
            conditionMode="reveal"
            onChange={onChange}
            onSetEphemeral={setEphemeral}
          />
        ) : (
          <div className={styles.empty}>This widget declares no settings.</div>
        )}

        <div className={styles.jsonBlock}>
          <div className={styles.jsonHeader}>
            <Button
              size="sm"
              variant={jsonView === "preset" ? "accent" : "default"}
              onClick={() => setJsonView("preset")}
              title="Only what differs from the defaults - paste into presetsSettings"
            >
              As preset
            </Button>
            <Button
              size="sm"
              variant={jsonView === "settings" ? "accent" : "default"}
              onClick={() => setJsonView("settings")}
              title="Every resolved setting value"
            >
              Full
            </Button>
            <Button size="sm" onClick={copyJson}>
              Copy
            </Button>
          </div>
          <pre className={styles.json}>{json}</pre>
        </div>
      </div>
    </div>
  );
}
