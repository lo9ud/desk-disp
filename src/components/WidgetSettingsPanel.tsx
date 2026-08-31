import { useCallback, useEffect, useState } from "react";
import {
  getWidgetDefinition,
  LocalValues,
  ResolvedWidgetSettingsEntry,
  SelectOptionDef,
  SettingCondition,
  VerifyStatus,
  WidgetSettingsDefinition,
} from "../registry/defRegistry";
import { useWidgetInstance } from "../registry/instanceRegistry";
import { collectDefaults } from "../registry/settingsDefaults";
import { useEditMode } from "../context/EditModeContext";
import { useRuntime } from "../runtime/context";
import { useDebouncedAsyncValue } from "../hooks/useDebouncedAsyncValue";
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

function MarkerText({
  compute,
  allValues,
  deps,
}: {
  compute: (local: LocalValues) => string | Promise<string>;
  allValues: LocalValues;
  deps?: string[];
}) {
  const text = useDebouncedAsyncValue(compute, allValues, "", deps);
  return <span>{text}</span>;
}

function VerifyStatusText({ status }: { status: VerifyStatus }) {
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

function StatusText({
  compute,
  allValues,
  deps,
}: {
  compute: (local: LocalValues) => VerifyStatus | Promise<VerifyStatus>;
  allValues: LocalValues;
  deps?: string[];
}) {
  const status = useDebouncedAsyncValue<VerifyStatus>(
    compute,
    allValues,
    { state: "pending" },
    deps,
  );
  return <VerifyStatusText status={status} />;
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
  // Writes into the ephemeral (session-only, never persisted) value bag --
  // today, only TriggerRow ever calls this, to record its own run's result
  // under its own key. Threaded through every row uniformly (same as
  // onChange) since a trigger can appear nested inside a group or a select
  // option's subordinate settings, not just at the top level.
  onSetEphemeral: (key: string, val: unknown) => void;
}

function BooleanRow({
  label,
  settingKey,
  value,
  disabled,
  onChange,
}: Omit<
  RowProps<Extract<Entry, { type: "boolean" }>>,
  "def" | "allValues" | "onSetEphemeral"
>) {
  return (
    <ToggleInput
      label={label}
      value={!!value}
      onChange={(newVal) => onChange(settingKey, newVal)}
      disabled={disabled}
    />
  );
}

function StaticSelectRow({
  label,
  settingKey,
  options,
  value,
  allValues,
  disabled,
  onChange,
  onSetEphemeral,
}: {
  label: string;
  settingKey: string;
  options: Record<string, string | SelectOptionDef>;
  value: unknown;
  allValues: Record<string, unknown>;
  disabled: boolean;
  onChange: (key: string, val: unknown) => void;
  onSetEphemeral: (key: string, val: unknown) => void;
}) {
  const selectVal = typeof value === "string" ? value : "";
  const currentOption = options[selectVal];
  const subDef =
    typeof currentOption === "object" ? currentOption.settings : undefined;
  return (
    <>
      <SelectInput
        label={label}
        value={selectVal}
        onChange={(newVal) => onChange(settingKey, newVal)}
        options={Object.entries(options).map(([k, v]) => ({
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
            onSetEphemeral={onSetEphemeral}
          />
        ))}
    </>
  );
}

function DynamicSelectRow({
  label,
  settingKey,
  generate,
  deps,
  value,
  allValues,
  disabled,
  onChange,
}: {
  label: string;
  settingKey: string;
  generate: (
    local: LocalValues,
  ) =>
    | Record<string, string | SelectOptionDef>
    | Promise<Record<string, string | SelectOptionDef>>;
  deps: string[] | undefined;
  value: unknown;
  allValues: Record<string, unknown>;
  disabled: boolean;
  onChange: (key: string, val: unknown) => void;
}) {
  // Stale-while-revalidate comes for free from useDebouncedAsyncValue's own
  // contract: `options` only ever updates to a freshly-resolved set, never
  // resets to empty mid-fetch, so this never flashes empty while
  // repopulating -- only ever swaps directly from one populated set to the
  // next.
  const options = useDebouncedAsyncValue<
    Record<string, string | SelectOptionDef>
  >(generate, allValues, {}, deps);
  const selectVal = typeof value === "string" ? value : "";

  // Two separate guards, for two separate failure modes -- neither
  // subsumes the other:
  //
  // 1. The instant a named dep changes, the currently-selected value's
  //    validity is unknown again -- `options` won't reflect the change
  //    until the debounced `generate` call actually resolves, and
  //    stale-while-revalidate means the OLD option set stays on screen
  //    (and the old selection stays looking valid) throughout that window.
  //    Continuing to show it as selected during that window would be the
  //    same mistake TriggerRow's own deps-invalidation fixes for triggers:
  //    a value that hasn't been re-verified must not keep looking verified.
  //    Un-set eagerly, before `options` has even started re-resolving.
  const depValues = deps?.map((key) => allValues[key]) ?? [];
  useEffect(
    () => {
      if (selectVal) onChange(settingKey, undefined);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly when a named dep's value changes, not on every render
    },
    deps ? depValues : [],
  );

  // 2. Backstop for everything (1) doesn't cover: a mount-once dynamic
  //    select (no `deps` at all) or an option set that changed for a
  //    reason no local dep captures (e.g. genuinely remote-backed data).
  //    Once a fresh `options` actually lands, drop a selection that isn't
  //    in it -- a dynamic select can't declare `default` (see
  //    settingsSchema.ts's FlattenDef: it's a SchemaError) since there's no
  //    way to verify ANY string against an option set that doesn't exist
  //    yet, so falling back to one would just trade one unverifiable guess
  //    for another; "no selection" is the only honest fallback. Guarded on
  //    a non-empty `options` so this doesn't fire against the transient
  //    empty set before the very first resolution lands.
  useEffect(() => {
    if (
      selectVal &&
      Object.keys(options).length > 0 &&
      !(selectVal in options)
    ) {
      onChange(settingKey, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to a freshly-resolved option set, not to the user's own edits
  }, [options]);

  return (
    <SelectInput
      label={label}
      value={selectVal}
      onChange={(newVal) => onChange(settingKey, newVal)}
      options={Object.entries(options).map(([k, v]) => ({
        label: typeof v === "string" ? v : v.label,
        value: k,
      }))}
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
  onSetEphemeral,
}: RowProps<Extract<Entry, { type: "select" }>>) {
  // Same reasoning as collectDefaults above: options is optional on the
  // authoring type, but this entry belongs to an already-registered widget,
  // so it's safe to resolve back to required here.
  const resolvedDef = def as ResolvedWidgetSettingsEntry<typeof def>;
  const options = resolvedDef.options;

  // Which of Static/DynamicSelectRow renders is fixed for this select's
  // entire lifetime -- it comes from the widget's own settingsDef, authored
  // once, never toggling between static and dynamic at runtime. Same
  // "stable branch per component instance" reasoning SettingRow's own type
  // dispatch already relies on: branching here, in a component that itself
  // calls no hooks, keeps DynamicSelectRow's extra hook usage entirely out
  // of the (much more common) static case.
  if (typeof options === "function") {
    return (
      <DynamicSelectRow
        label={label}
        settingKey={settingKey}
        generate={options}
        deps={resolvedDef.deps}
        value={value}
        allValues={allValues}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }
  return (
    <StaticSelectRow
      label={label}
      settingKey={settingKey}
      options={options}
      value={value}
      allValues={allValues}
      disabled={disabled}
      onChange={onChange}
      onSetEphemeral={onSetEphemeral}
    />
  );
}

function NumberRow({
  label,
  settingKey,
  def,
  value,
  allValues,
  disabled,
  onChange,
}: Omit<RowProps<Extract<Entry, { type: "number" }>>, "onSetEphemeral">) {
  const numValue = Number(value ?? 0);
  const validation = def.validate ? def.validate(numValue, allValues) : true;
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
    <>
      {
        //@ts-expect-error rangeProps is either steps or min/max/step, but TS doesn't narrow it correctly
        <RangeInput
          label={label}
          value={numValue}
          onChange={(newVal) => onChange(settingKey, newVal)}
          unit={def.unit}
          disabled={disabled}
          {...rangeProps}
        />
      }
      {validation !== true && <div>{validation}</div>}
    </>
  );
}

function DynamicStringRow({
  label,
  settingKey,
  generate,
  deps,
  value,
  allValues,
  disabled,
  onChange,
}: {
  label: string;
  settingKey: string;
  generate: (local: LocalValues) => string[] | Promise<string[]>;
  deps: string[] | undefined;
  value: unknown;
  allValues: Record<string, unknown>;
  disabled: boolean;
  onChange: (key: string, val: unknown) => void;
}) {
  const suggestions = useDebouncedAsyncValue<string[]>(
    generate,
    allValues,
    [],
    deps,
  );
  return (
    <TextInput
      value={typeof value === "string" ? value : ""}
      onChange={(newVal) => onChange(settingKey, newVal)}
      label={label}
      auto={suggestions}
      disabled={disabled}
    />
  );
}

function StringRow({
  label,
  settingKey,
  def,
  value,
  allValues,
  disabled,
  onChange,
}: Omit<RowProps<Extract<Entry, { type: "string" }>>, "onSetEphemeral">) {
  const strValue = typeof value === "string" ? value : "";
  const validation = def.validate ? def.validate(strValue, allValues) : true;
  const suggestions = def.suggestions;
  const input =
    typeof suggestions === "function" ? (
      <DynamicStringRow
        label={label}
        settingKey={settingKey}
        generate={suggestions}
        deps={def.deps}
        value={value}
        allValues={allValues}
        disabled={disabled}
        onChange={onChange}
      />
    ) : (
      <TextInput
        value={strValue}
        onChange={(newVal) => onChange(settingKey, newVal)}
        label={label}
        auto={suggestions}
        disabled={disabled}
      />
    );
  return (
    <>
      {input}
      {validation !== true && <div>{validation}</div>}
    </>
  );
}

function GroupRow({
  label,
  def,
  allValues,
  onChange,
  onSetEphemeral,
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
        <StatusText
          compute={def.verify.run}
          allValues={allValues}
          deps={def.verify.deps}
        />
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
          onSetEphemeral={onSetEphemeral}
        />
      ))}
    </InputGroup>
  );
}

function TriggerRow({
  label,
  settingKey,
  def,
  allValues,
  disabled,
  onSetEphemeral,
}: Omit<RowProps<Extract<Entry, { type: "trigger" }>>, "value" | "onChange">) {
  // The trigger's own last result, if `run` has ever resolved to one --
  // lives in the ephemeral bag under this trigger's OWN key (see
  // WidgetSettingsPanel's onSetEphemeral), same shape `indicator` reads,
  // just pulled by a click instead of pushed by a deps change. Defaults to
  // idle (never run, or ran and returned void) rather than rendering
  // nothing -- a trigger always has SOME status, same as indicator always
  // does.
  const lastStatus = (allValues[settingKey] as VerifyStatus | undefined) ?? {
    state: "idle",
  };

  // `deps` here doesn't re-fire `run` (see settingsSchema.ts's trigger
  // case) -- it invalidates a stale result instead. The moment any named
  // dep's VALUE changes after a real result was recorded, that result no
  // longer describes the current settings, so reset to idle rather than
  // keep showing a claim that's gone stale. Guarded on the current status
  // already being non-idle so this is a no-op on mount and doesn't loop
  // (setting idle-when-already-idle would still re-render for no reason).
  const depValues = def.deps?.map((key) => allValues[key]) ?? [];
  useEffect(
    () => {
      if (lastStatus.state !== "idle") {
        onSetEphemeral(settingKey, { state: "idle" });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- fire exactly when a named dep's value changes, not on every render
    },
    def.deps ? depValues : [],
  );

  return (
    <>
      <label>{label}</label>
      <Button
        type="button"
        disabled={disabled}
        onClick={async () => {
          if (def.confirm && !window.confirm(`Run "${label}"?`)) return;
          const result = await def.run(allValues);
          if (result !== undefined) onSetEphemeral(settingKey, result);
        }}
      >
        Do thing
      </Button>
      <VerifyStatusText status={lastStatus} />
    </>
  );
}

function MarkerRow({
  label,
  def,
  allValues,
}: Omit<
  RowProps<Extract<Entry, { type: "marker" }>>,
  "settingKey" | "value" | "disabled" | "onChange" | "onSetEphemeral"
>) {
  return (
    <>
      <label>{label}</label>
      <MarkerText compute={def.compute} allValues={allValues} deps={def.deps} />
    </>
  );
}

function IndicatorRow({
  label,
  def,
  allValues,
}: Omit<
  RowProps<Extract<Entry, { type: "indicator" }>>,
  "settingKey" | "value" | "disabled" | "onChange" | "onSetEphemeral"
>) {
  return (
    <div>
      {label}:{" "}
      <StatusText compute={def.compute} allValues={allValues} deps={def.deps} />
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
  onSetEphemeral,
}: {
  label: string;
  settingKey: string;
  def: Entry;
  value: unknown;
  allValues: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  onSetEphemeral: (key: string, val: unknown) => void;
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
          onSetEphemeral={onSetEphemeral}
        />
      );
    case "number":
      return (
        <NumberRow
          label={label}
          settingKey={settingKey}
          def={def}
          value={value}
          allValues={allValues}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "string":
      return (
        <StringRow
          label={label}
          settingKey={settingKey}
          def={def}
          value={value}
          allValues={allValues}
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
          onSetEphemeral={onSetEphemeral}
        />
      );
    case "trigger":
      return (
        <TriggerRow
          label={label}
          settingKey={settingKey}
          def={def}
          allValues={allValues}
          disabled={disabled}
          onSetEphemeral={onSetEphemeral}
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

/**
 * The schema-driven form itself, with no opinion about where its values live.
 * Hosted two ways: by the modal WidgetSettingsPanel below, and by edit mode's
 * anchored SettingsPanel. Keep it free of registry/edit-mode imports.
 */
export function SettingsForm({
  title,
  schema,
  values,
  ephemeral,
  onChange,
  onSetEphemeral,
}: {
  title: string;
  schema: WidgetSettingsDefinition;
  values: Record<string, unknown>;
  ephemeral: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  onSetEphemeral: (key: string, val: unknown) => void;
}) {
  const allValues = { ...values, ...ephemeral };
  return (
    <InputGroup label={title}>
      {Object.entries(schema).map(([key, setting]) => (
        <SettingRow
          key={key}
          label={setting.label}
          settingKey={key}
          def={setting}
          value={values[key]}
          allValues={allValues}
          onChange={onChange}
          onSetEphemeral={onSetEphemeral}
        />
      ))}
    </InputGroup>
  );
}

/**
 * Session-only trigger results (see TriggerRow), keyed by the trigger's own
 * settingKey. Merged into what compute functions read, but never persisted --
 * and reset on every mount, which is correct for "last connection test
 * result"-style data.
 */
export function useEphemeralValues() {
  const [ephemeral, setEphemeral] = useState<Record<string, unknown>>({});
  const set = useCallback((key: string, val: unknown) => {
    setEphemeral((prev) => ({ ...prev, [key]: val }));
  }, []);
  // Needed where the form is reused across widgets without remounting, which
  // would otherwise carry one widget's trigger results over to the next.
  const reset = useCallback(() => setEphemeral({}), []);
  return { ephemeral, setEphemeral: set, resetEphemeral: reset };
}

export default function WidgetSettingsPanel({
  instanceId,
  onClose,
}: WidgetSettingsPanelProps) {
  const runtime = useRuntime();
  const { editRegistry, updateWidgetSettings } = useEditMode();
  const inst = useWidgetInstance(instanceId, editRegistry ?? runtime.instances);
  const def = inst ? getWidgetDefinition(inst.definitionId) : undefined;

  const [localSettings, setLocalSettings] = useState<Record<string, unknown>>(
    () => ({
      ...(def?.settingsDef ? collectDefaults(def.settingsDef) : {}),
      ...inst?.settings,
    }),
  );
  const { ephemeral, setEphemeral } = useEphemeralValues();

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
      onClose={onClose}
      actions={
        <Button variant="ghost_danger" onClick={() => onClose?.()}>
          Close
        </Button>
      }
    >
      <SettingsForm
        title={`${def.name} settings`}
        schema={def.settingsDef}
        values={localSettings}
        ephemeral={ephemeral}
        onChange={handleChange}
        onSetEphemeral={setEphemeral}
      />
    </Modal>
  );
}
