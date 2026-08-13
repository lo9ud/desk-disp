import { useEffect, useState } from "react";
import {
  getWidgetDefinition,
  LocalValues,
  ResolvedWidgetSettingsEntry,
  SelectOptionDef,
  SettingCondition,
  VerifyStatus,
  WidgetSettingsDefinition,
} from "../registry/defRegistry";
import {
  canonicalRegistry,
  useWidgetInstance,
} from "../registry/instanceRegistry";
import { useEditMode } from "../context/EditModeContext";
import ToggleInput from "./inputs/ToggleInput";
import { RangeInput, SelectInput, TextInput } from "./inputs";
import InputGroup from "./inputs/InputGroup";
import { Modal } from "../primitives/Modal";
import { Button } from "../primitives/Button";

function evalCondition(
  cond: SettingCondition,
  allValues: Record<string, unknown>,
): boolean {
  if ("when" in cond) return cond.when(allValues);
  const val = allValues[cond.key];
  return Array.isArray(cond.is)
    ? (cond.is as unknown[]).includes(val)
    : val === cond.is;
}

// Defaults contributed by a select's subordinate options -- pulled out of
// collectDefaults so that function stays flat (one thing per case) rather
// than nesting a second loop inside it.
function collectSelectSubordinateDefaults(
  options: Record<string, string | SelectOptionDef>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const opt of Object.values(options)) {
    if (typeof opt === "object" && opt.settings) {
      Object.assign(defaults, collectDefaults(opt.settings));
    }
  }
  return defaults;
}

function collectDefaults(
  def: WidgetSettingsDefinition,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, setting] of Object.entries(def)) {
    // group/trigger/marker/indicator aren't value-bearing (no default/required
    // at all) -- a group's own settings still need collecting recursively,
    // same as a select's subordinate settings below; the other three store
    // nothing and are skipped entirely.
    if (setting.type === "group") {
      Object.assign(defaults, collectDefaults(setting.settings));
      continue;
    }
    if (
      setting.type === "trigger" ||
      setting.type === "marker" ||
      setting.type === "indicator"
    ) {
      continue;
    }
    if (!setting.required) {
      defaults[key] = setting.default;
    }
    if (setting.type === "select") {
      // `options` is optional on the authoring-facing WidgetSettingsEntry
      // (so a missing one becomes a SchemaError instead of a rejected
      // literal) but this settingsDef came from an already-registered
      // widget -- a genuinely missing `options` would have failed to
      // compile at that widget's own registerWidget call, so it's safe to
      // resolve it back to required here.
      const resolved = setting as ResolvedWidgetSettingsEntry<typeof setting>;
      Object.assign(
        defaults,
        collectSelectSubordinateDefaults(resolved.options),
      );
    }
  }
  return defaults;
}

// Mount-once (not deps-driven -- that's phase 3) resolver shared by marker
// and indicator/group.verify below: run `compute` once against the settings
// snapshot in effect at mount time, render whatever it resolves to. Ignores
// re-renders from unrelated setting changes on purpose, per the plan's phase
// 2/3 line -- reactivity is explicitly out of scope until deps exist.
function useMountOnceResolved<T>(
  compute: (local: LocalValues) => T | Promise<T>,
  allValues: LocalValues,
  initial: T,
): T {
  const [resolved, setResolved] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(compute(allValues)).then((val) => {
      if (!cancelled) setResolved(val);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once by design (phase 2)
  }, []);
  return resolved;
}

// Deliberately plain text, no styling -- phase 2 is "prove the machinery
// works," not "look good." A broader input-generation overhaul is planned
// separately and would likely throw this away.
function MarkerText({
  compute,
  allValues,
}: {
  compute: (local: LocalValues) => string | Promise<string>;
  allValues: LocalValues;
}) {
  const text = useMountOnceResolved(compute, allValues, "");
  return <span>{text}</span>;
}

function StatusText({
  compute,
  allValues,
}: {
  compute: (local: LocalValues) => VerifyStatus | Promise<VerifyStatus>;
  allValues: LocalValues;
}) {
  const status = useMountOnceResolved<VerifyStatus>(compute, allValues, {
    state: "pending",
  });
  const detail =
    status.state === "ok" || status.state === "error"
      ? status.detail
      : undefined;
  return (
    <span>
      [{status.state}]{detail ? `: ${detail}` : ""}
    </span>
  );
}

// A concrete settings entry (not the WidgetSettingsDefinition it lives in) --
// alias purely for readability in the per-case row components below.
type Entry = WidgetSettingsDefinition[string];

// Common props every row component shares. `def` is narrowed further per
// case via Extract<Entry, {type: "..."}>; boolean/string don't need it at
// all (their whole shape is EntryBase, nothing case-specific to read).
interface RowProps<D> {
  label: string;
  settingKey: string;
  def: D;
  value: unknown;
  allValues: Record<string, unknown>;
  disabled: boolean;
  onChange: (key: string, val: unknown) => void;
}

function BooleanRow({
  label,
  settingKey,
  value,
  disabled,
  onChange,
}: Omit<RowProps<Extract<Entry, { type: "boolean" }>>, "def" | "allValues">) {
  return (
    <ToggleInput
      label={label}
      value={!!value}
      onChange={(newVal) => onChange(settingKey, newVal)}
      disabled={disabled}
    />
  );
}

function SelectRow({
  label,
  settingKey,
  def,
  value,
  allValues,
  disabled,
  onChange,
}: RowProps<Extract<Entry, { type: "select" }>>) {
  // Same reasoning as collectDefaults above: options is optional on the
  // authoring type, but this entry belongs to an already-registered widget,
  // so it's safe to resolve back to required here.
  const resolvedDef = def as ResolvedWidgetSettingsEntry<typeof def>;
  const selectVal = typeof value === "string" ? value : "";
  const currentOption = resolvedDef.options[selectVal];
  const subDef =
    typeof currentOption === "object" ? currentOption.settings : undefined;
  return (
    <>
      <SelectInput
        label={label}
        value={selectVal}
        onChange={(newVal) => onChange(settingKey, newVal)}
        options={Object.entries(resolvedDef.options).map(([k, v]) => ({
          label: typeof v === "string" ? v : v.label,
          value: k,
        }))}
        disabled={disabled}
      />
      {subDef &&
        Object.entries(subDef).map(([key, setting]) => (
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

function NumberRow({
  label,
  settingKey,
  def,
  value,
  disabled,
  onChange,
}: Omit<RowProps<Extract<Entry, { type: "number" }>>, "allValues">) {
  const rangeProps =
    "steps" in def
      ? { steps: def.steps }
      : "min" in def && "max" in def && "step" in def
        ? {
            min: def.min,
            max: def.max,
            step: def.step,
          }
        : undefined;
  return (
    //@ts-expect-error rangeProps is either steps or min/max/step, but TS doesn't narrow it correctly
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

function StringRow({
  label,
  settingKey,
  value,
  disabled,
  onChange,
}: Omit<RowProps<Extract<Entry, { type: "string" }>>, "def" | "allValues">) {
  return (
    <TextInput
      value={typeof value === "string" ? value : ""}
      onChange={(newVal) => onChange(settingKey, newVal)}
      label={label}
      disabled={disabled}
    />
  );
}

// --- Phase 2: structural cases, deliberately minimal rendering (see plan's
// "No new UI investment this phase" note) ---

function GroupRow({
  label,
  def,
  allValues,
  onChange,
}: Omit<
  RowProps<Extract<Entry, { type: "group" }>>,
  "settingKey" | "value" | "disabled"
>) {
  const validation = def.validate ? def.validate(allValues) : true;
  return (
    <InputGroup
      label={`${label}${validation !== true ? " (validation failed)" : ""}`}
    >
      {def.verify && (
        <StatusText compute={def.verify.run} allValues={allValues} />
      )}
      {validation !== true && <div>{validation}</div>}
      {Object.entries(def.settings).map(([key, setting]) => (
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
    </InputGroup>
  );
}

function TriggerRow({
  label,
  def,
  allValues,
  disabled,
}: Omit<
  RowProps<Extract<Entry, { type: "trigger" }>>,
  "settingKey" | "value" | "onChange"
>) {
  return (
    <>
      <label>{label}</label>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (def.confirm && !window.confirm(`Run "${label}"?`)) return;
          void def.run(allValues);
        }}
      >
        Do thing
      </Button>
    </>
  );
}

function MarkerRow({
  label,
  def,
  allValues,
}: Omit<
  RowProps<Extract<Entry, { type: "marker" }>>,
  "settingKey" | "value" | "disabled" | "onChange"
>) {
  return (
    <>
      <label>{label}</label>
      <MarkerText compute={def.compute} allValues={allValues} />
    </>
  );
}

function IndicatorRow({
  label,
  def,
  allValues,
}: Omit<
  RowProps<Extract<Entry, { type: "indicator" }>>,
  "settingKey" | "value" | "disabled" | "onChange"
>) {
  return (
    <div>
      {label}: <StatusText compute={def.compute} allValues={allValues} />
    </div>
  );
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
  def: Entry;
  value: unknown;
  allValues: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
}) {
  if (def.showWhen && !evalCondition(def.showWhen, allValues)) return null;
  const disabled = def.enableWhen
    ? !evalCondition(def.enableWhen, allValues)
    : false;

  switch (def.type) {
    case "boolean":
      return (
        <BooleanRow
          label={label}
          settingKey={settingKey}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "select":
      return (
        <SelectRow
          label={label}
          settingKey={settingKey}
          def={def}
          value={value}
          allValues={allValues}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <NumberRow
          label={label}
          settingKey={settingKey}
          def={def}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "string":
      return (
        <StringRow
          label={label}
          settingKey={settingKey}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "group":
      return (
        <GroupRow
          label={label}
          def={def}
          allValues={allValues}
          onChange={onChange}
        />
      );
    case "trigger":
      return (
        <TriggerRow
          label={label}
          def={def}
          allValues={allValues}
          disabled={disabled}
        />
      );
    case "marker":
      return <MarkerRow label={label} def={def} allValues={allValues} />;
    case "indicator":
      return <IndicatorRow label={label} def={def} allValues={allValues} />;
  }
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
      ...inst?.settings,
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
        <Button variant="ghost_danger" onClick={() => onClose?.()}>
          Close
        </Button>
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
