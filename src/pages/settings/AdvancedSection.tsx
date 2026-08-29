import { useEffect, useRef, useState } from "react";
import InputGroup from "../../components/inputs/InputGroup";
import { RangeInput } from "../../components/inputs";
import pageStyles from "./styles/Settings.module.css";
import { Button } from "../../primitives/Button";
import { useRuntime } from "../../runtime/context";
import type { Preferences } from "../../ffi_types";

const DEFAULT_PREFS: Preferences = {
  rounded: false,
  widget_transparent: false,
  background_transparent: false,
  font_scale: 1,
};

export default function AdvancedSection() {
  const runtime = useRuntime();
  const [draft, setDraft] = useState<Preferences>(DEFAULT_PREFS);
  const confirmedRef = useRef<Preferences>(DEFAULT_PREFS);

  useEffect(() => {
    runtime.config.get().then((cfg) => {
      const prefs = cfg.preferences ?? DEFAULT_PREFS;
      setDraft(prefs);
      confirmedRef.current = prefs;
    });
  }, []);

  function updateScale(font_scale: number) {
    setDraft((prev) => {
      const next = { ...prev, font_scale };
      runtime.config.previewPreferences(next);
      return next;
    });
  }

  async function handleSave() {
    await runtime.config.setPreferences(draft);
    confirmedRef.current = draft;
  }

  function handleCancel() {
    setDraft(confirmedRef.current);
    runtime.config.previewPreferences(confirmedRef.current);
  }

  return (
    <section className={pageStyles.section}>
      <InputGroup label="Typography">
        <RangeInput
          label="Font scale"
          value={draft.font_scale}
          onChange={updateScale}
          min={0.75}
          max={1.5}
          step={0.05}
        />
      </InputGroup>
      <div className={pageStyles.button_row}>
        <Button variant="default" onClick={handleSave}>Save</Button>
        <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
      </div>
    </section>
  );
}
