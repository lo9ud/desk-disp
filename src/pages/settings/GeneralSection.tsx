import { useEffect, useRef, useState } from "react";
import InputGroup from "../../components/inputs/InputGroup";
import pageStyles from "./styles/Settings.module.css";
import ToggleInput from "../../components/inputs/ToggleInput";
import { Button } from "../../primitives/Button";
import { useRuntime } from "../../runtime/context";
import type { Preferences } from "../../ffi_types";
import { CHAPTERS } from "../../onboarding/chapters";

const DEFAULT_PREFS: Preferences = {
  rounded: false,
  widget_transparent: false,
  background_transparent: false,
  font_scale: 1,
};

export default function GeneralSection() {
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

  function updateDraft(patch: Partial<Preferences>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
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

  // Resetting to unseen is the whole mechanism: the main window is listening for
  // the config broadcast and restarts any chapter that goes back to it.
  function handleReplayTour() {
    for (const chapter of CHAPTERS) {
      runtime.config.setOnboarding(chapter.id, {
        status: "unseen",
        reached: null,
      });
    }
  }

  return (
    <section className={pageStyles.section}>
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
      <InputGroup
        label="Application"
        headerButtons={[
          { label: "Replay tour", variant: "ghost", onClick: handleReplayTour },
        ]}
      >
        <ToggleInput label="Run on startup" value={false} onChange={() => {}} />
        <ToggleInput label="Show taskbar icon" value={true} onChange={() => {}} />
        <ToggleInput label="Show tray icon" value={true} onChange={() => {}} />
      </InputGroup>
      <div className={pageStyles.button_row}>
        <Button variant="default" onClick={handleSave}>Save</Button>
        <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
      </div>
    </section>
  );
}
