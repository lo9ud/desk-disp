import { useEffect, useRef, useState } from "react";
import InputGroup from "../../components/inputs/InputGroup";
import pageStyles from "./styles/Settings.module.css";
import styles from "./styles/GeneralSection.module.css";
import ToggleInput from "../../components/inputs/ToggleInput";
import { Button } from "../../primitives/Button";
import { ipc } from "../../ipc";
import type { Preferences } from "../../ffi_types";

const DEFAULT_PREFS: Preferences = {
  rounded: false,
  widget_transparent: false,
  background_transparent: false,
  font_scale: 1,
};

export default function GeneralSection() {
  const [draft, setDraft] = useState<Preferences>(DEFAULT_PREFS);
  const confirmedRef = useRef<Preferences>(DEFAULT_PREFS);

  useEffect(() => {
    ipc.getConfig().then((cfg) => {
      const prefs = cfg.preferences ?? DEFAULT_PREFS;
      setDraft(prefs);
      confirmedRef.current = prefs;
    });
  }, []);

  function updateDraft(patch: Partial<Preferences>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      ipc.previewPreferences(next);
      return next;
    });
  }

  async function handleSave() {
    await ipc.setPreferences(draft);
    confirmedRef.current = draft;
  }

  function handleCancel() {
    setDraft(confirmedRef.current);
    ipc.previewPreferences(confirmedRef.current);
  }

  return (
    <section className={pageStyles.section}>
      <div className={styles.gridSettingsContainer}>
        <InputGroup label="Visual">
          <ToggleInput
            label="Rounded widgets"
            value={draft.rounded}
            onChange={(v) => updateDraft({ rounded: v })}
          />
          <ToggleInput
            label="Transparent widgets"
            value={draft.widget_transparent}
            onChange={(v) => updateDraft({ widget_transparent: v })}
          />
          <ToggleInput
            label="Transparent background"
            value={draft.background_transparent}
            onChange={(v) => updateDraft({ background_transparent: v })}
          />
        </InputGroup>
        <InputGroup label="Application">
          <ToggleInput label="Run on startup" value={false} onChange={() => {}} />
          <ToggleInput label="Show taskbar icon" value={true} onChange={() => {}} />
          <ToggleInput label="Show tray icon" value={true} onChange={() => {}} />
        </InputGroup>
        <div className={pageStyles.button_row}>
          <Button variant="default" onClick={handleSave}>Save</Button>
          <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
        </div>
      </div>
    </section>
  );
}
