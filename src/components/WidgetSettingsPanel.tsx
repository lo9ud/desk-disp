import { useState } from "react";
import {
  getWidgetDefinition,
  SettingCondition,
  WidgetSettingsDefinition,
} from "../registry/defRegistry";
import { canonicalRegistry, useWidgetInstance } from "../registry/instanceRegistry";
import { useEditMode } from "../context/EditModeContext";
import styles from "./styles/WidgetSettingsPanel.module.css";
import ToggleInput from "./inputs/ToggleInput";
import { RangeInput, SelectInput, TextInput } from "./inputs";
import InputGroup from "./inputs/InputGroup";
import { Modal } from "../primitives/Modal";
import { Button } from "../primitives/Button";

function evalCondition(cond: SettingCondition, allValues: Record<string, unknown>): boolean {
  if ("when" in cond) return cond.when(allValues);
  const val = allValues[cond.key];
  return Array.isArray(cond.is) ? (cond.is as unknown[]).includes(val) : val === cond.is;
}

function collectDefaults(def: WidgetSettingsDefinition): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, setting] of Object.entries(def)) {
    if (!setting.required && setting.default !== undefined) {
      defaults[key] = setting.default;
    }
    if (setting.type === "select") {
      for (const opt of Object.values(setting.options)) {
        if (typeof opt === "object" && opt.settings) {
          Object.assign(defaults, collectDefaults(opt.settings));
        }
      }
    }
  }
  return defaults;
}

function SettingRow({
  label,
  settingKey,
  def,
  value,
  allValues,
  onChange,
}: {
  label: string;
  settingKey: string;
  def: WidgetSettingsDefinition[string];
  value: unknown;
  allValues: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
}) {
  if (def.showWhen && !evalCondition(def.showWhen, allValues)) return null;
  const disabled = def.enableWhen ? !evalCondition(def.enableWhen, allValues) : false;

  if (def.type === "boolean") {
    return (
      <ToggleInput
        label={label}
        value={!!value}
        onChange={(newVal) => onChange(settingKey, newVal)}
        disabled={disabled}
      />
    );
  }

  if (def.type === "select") {
    const selectVal = typeof value === "string" ? value : "";
    const currentOption = def.options[selectVal];
    const subDef = typeof currentOption === "object" ? currentOption.settings : undefined;
    return (
      <>
        <SelectInput
          label={label}
          value={selectVal}
          onChange={(newVal) => onChange(settingKey, newVal)}
          options={Object.entries(def.options).map(([k, v]) => ({
            label: typeof v === "string" ? v : v.label,
            value: k,
          }))}
          disabled={disabled}
        />
        {subDef && Object.entries(subDef).map(([key, setting]) => (
          <SettingRow
            key={key}
            label={setting.label}
            settingKey={key}
            def={setting}
            value={allValues[key]}
            allValues={allValues}
            onChange={onChange}
          />
        ))}
      </>
    );
  }

  if (def.type === "number") {
    const rangeProps = "steps" in def
      ? { steps: def.steps }
      : { min: def.min, max: def.max, step: def.step };
    return (
      <RangeInput
        label={label}
        value={Number(value ?? 0)}
        onChange={(newVal) => onChange(settingKey, newVal)}
        unit={def.unit}
        disabled={disabled}
        {...rangeProps}
      />
    );
  }

  return (
    <TextInput
      value={typeof value === "string" ? value : ""}
      onChange={(newVal) => onChange(settingKey, newVal)}
      label={label}
      disabled={disabled}
    />
  );
}

interface WidgetSettingsPanelProps {
  instanceId: string;
  onClose?: () => void;
}

export default function WidgetSettingsPanel({
  instanceId,
  onClose,
}: WidgetSettingsPanelProps) {
  const { editRegistry, updateWidgetSettings } = useEditMode();
  const inst = useWidgetInstance(instanceId, editRegistry ?? canonicalRegistry);
  const def = inst ? getWidgetDefinition(inst.definitionId) : undefined;

  const [localSettings, setLocalSettings] = useState<Record<string, unknown>>(
    () => ({
      ...(def?.settingsDef ? collectDefaults(def.settingsDef) : {}),
      ...(inst?.settings ?? {}),
    }),
  );

  if (!inst || !def?.settingsDef || Object.keys(def.settingsDef).length === 0) {
    throw new Error(
      "Attempted to render WidgetSettingsPanel for widget with no settings",
    );
  }

  function handleChange(key: string, val: unknown) {
    const next = { ...localSettings, [key]: val };
    setLocalSettings(next);
    updateWidgetSettings(instanceId, next);
  }

  return (
    <Modal
      data-no-drag
      actions={
        <Button variant="ghost_danger" onClick={() => onClose?.()}>Close</Button>
      }
    >
      <InputGroup label={`${def.name} settings`}>
        {Object.entries(def.settingsDef).map(([key, setting]) => (
          <SettingRow
            key={key}
            label={setting.label}
            settingKey={key}
            def={setting}
            value={localSettings[key]}
            allValues={localSettings}
            onChange={handleChange}
          />
        ))}
      </InputGroup>
    </Modal>
  );
}
