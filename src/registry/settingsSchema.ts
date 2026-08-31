import type {
  IsEqual,
  IsNever,
  MergeExclusive,
  UnionToIntersection,
  ValueOf as ObjectValueOf,
} from "type-fest";

// ---------------------------------------------------------------------------
// Common, type-independent pieces
// ---------------------------------------------------------------------------

export type SettingType = {
  string: string;
  number: number;
  boolean: boolean;
  select: string;
};

export type SettingCondition =
  | {
      key: string;
      is: SettingType[keyof SettingType] | SettingType[keyof SettingType][];
    }
  | { when: (settings: Record<string, unknown>) => boolean };

export type SelectOptionDef = {
  label: string;
  settings?: WidgetSettingsDefinition;
};

// Common head shared by every case in WidgetSettingsCaseMap below.
type EntryBase = {
  label: string;
  showWhen?: SettingCondition;
  enableWhen?: SettingCondition;
};

// What a group/trigger/marker/indicator's function-valued fields (validate,
// verify.run, trigger.run, compute) read as their "current settings" input.
export type LocalValues = Record<string, unknown>;

// Shared status vocabulary for group.verify and the standalone `indicator`
// case
export type VerifyStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "ok"; detail?: string }
  | { state: "error"; detail?: string };

// A select's `options`, either the static form or a dynamic,
// deps-driven generator
export type SelectOptionsSource =
  | Record<string, string | SelectOptionDef>
  | ((
      local: LocalValues,
    ) =>
      | Record<string, string | SelectOptionDef>
      | Promise<Record<string, string | SelectOptionDef>>);

// ---------------------------------------------------------------------------
// Case map -> entry union
// ---------------------------------------------------------------------------

export interface WidgetSettingsCaseMap {
  string: {
    suggestions?: string[] | ((local: LocalValues) => string[] | Promise<string[]>);
    // Only meaningful when `suggestions` is function-valued
    deps?: string[];
    // Should be simple, pure function of input state, not a side-effecting or async operation.
    validate?: (value: string, local: LocalValues) => true | string;
  };
  number: { unit?: string } & MergeExclusive<
    { min: number; max: number; step: number },
    { steps: number[] }
  > & {
    // See string.validate - same story
    validate?: (value: number, local: LocalValues) => true | string;
  };
  boolean: {};
  select: {
    options: SelectOptionsSource;
    // Only meaningful when `options` is function-valued.
    deps?: string[];
  };
  // Administrative: grouping + visibility + cross-field operations (validate etc.), not a
  // value-bearing case
  //
  // `validate` is a synchronous check, run on every change to any of the group's inputs. See string/number.validate above for the same story.
  // Usecase: Checking that a group of fields are mutually consistent (e.g. "min < max").
  // `verify` can be more complex, and may be async. It runs only on deps changes, not on every change to any of the group's inputs.
  // Usecase: Testing connection parameters
  group: {
    settings: WidgetSettingsDefinition;
    validate?: (local: LocalValues) => true | string;
    verify?: {
      run: (local: LocalValues) => VerifyStatus | Promise<VerifyStatus>;
      deps?: string[];
    };
  };
  // One-shot action button.
  trigger: {
    run: (local: LocalValues) => void | VerifyStatus | Promise<void | VerifyStatus>;
    confirm?: boolean;
    deps?: string[];
  };
  // Standalone derived read-only text.
  marker: {
    compute: (local: LocalValues) => string | Promise<string>;
    deps?: string[];
  };
  // Standalone derived colored status
  indicator: {
    compute: (local: LocalValues) => VerifyStatus | Promise<VerifyStatus>;
    deps?: string[];
  };
}

// The set of cases that produce a stored value (and so get default/required).
type ValueCaseKind = keyof SettingType;

// A case's own contributed value type, given its own extra shape. `select`'s
// keyof-options special case is the only one that isn't a direct SettingType
// lookup.
export type ValueOf<
  K extends keyof WidgetSettingsCaseMap,
  Extra,
> = K extends "select"
  ? Extra extends { options: infer O }
    ? O extends (...args: any[]) => any
      ? string
      : keyof O
    : never
  : K extends ValueCaseKind
    ? SettingType[K]
    : never;

export type WidgetSettingsEntry = {
  [K in keyof WidgetSettingsCaseMap]: EntryBase & { type: K } &
    // select's `options` is optional here -- in what an AUTHOR is allowed to
    // write -- deliberately, so a missing-options literal compiles and the
    // omission can be reported as a SchemaError (see ExtractSettingValue)
    // instead of being rejected outright.
    (K extends "select" ? Partial<WidgetSettingsCaseMap[K]> : WidgetSettingsCaseMap[K]) &
    (K extends ValueCaseKind
      ? // At least one of default/required is still enforced (a literal with
        // neither structurally satisfies neither branch below), but both present triggers a SchemaError (see ExtractSettingValue) 
        | { default: ValueOf<K, WidgetSettingsCaseMap[K]>; required?: true }
        | { required: true; default?: ValueOf<K, WidgetSettingsCaseMap[K]> }
      : {});
}[keyof WidgetSettingsCaseMap];

export interface WidgetSettingsDefinition {
  [settingKey: string]: WidgetSettingsEntry;
}

// WidgetSettingsEntry, but with select's `options` forced back to required.
export type ResolvedWidgetSettingsEntry<E = WidgetSettingsEntry> = E extends {
  type: "select";
}
  ? E & { options: SelectOptionsSource }
  : E;

// Given a concrete entry (not a case-map lookup, an actual `{type, ...}`
// value) and the key it was declared under, read off its own contributed
// value type.
//
type ExtractSettingValue<S, Key extends PropertyKey = PropertyKey> = S extends {
  type: infer K extends keyof WidgetSettingsCaseMap;
}
  ? K extends "select"
    ? S extends { options: infer O }
      ? O extends (...args: any[]) => any
        ? string
        : keyof O
      : SchemaError<`Setting '${Key & string}' is missing 'options', required for type: "select"`>
    : ValueOf<K, S>
  : never;

// ---------------------------------------------------------------------------
// Flattening: WidgetSettingsDefinition -> the flat props object a widget
// component actually receives.
// ---------------------------------------------------------------------------

// A branded error type: when a WidgetSettingsDefinition literal is technically
// valid on its own but produces a nonsensical *derived* type (see the
// colliding-subordinate-key case below -- nothing about either contributor's
// own literal is wrong, only the combination is), substituting this instead
// of `never`/`unknown` means the reason shows up verbatim in whatever
// downstream compile error eventually surfaces, instead of a generic
// diagnostic that says nothing (`never`) or cascades the whole surrounding
// type into uselessness (the entire type otherwise collapses into `never`/`unknown` due to UnionToIntersection).
export type SchemaError<Reason extends string> = { readonly __schemaError: Reason };

// Generic collision-aware merge over a set of "contributors," each of which
// either contributes its own subordinate-props object or is irrelevant
// (contributes `{}`).
type AllContributedKeys<PerContributor extends Record<PropertyKey, object>> = {
  [C in keyof PerContributor]: keyof PerContributor[C];
}[keyof PerContributor];

// What each contributor offers at key K, wrapped in a 1-tuple so the union
// below is a union of contributors' offerings, not a union of the literals
// inside any single contributor's own value -- an unwrapped union is
// indistinguishable from one contributor's own inherently multi-valued field
// (e.g. a nested select's own options) and produces false-positive
// collisions
type PerKeyAcrossContributors<
  PerContributor extends Record<PropertyKey, object>,
  K extends PropertyKey,
> = {
  [C in keyof PerContributor]: K extends keyof PerContributor[C]
    ? [PerContributor[C][K]]
    : never;
}[keyof PerContributor];

// UnionToIntersection<X> equals X itself exactly when X has at most one
// distinct contributor for a given key -- either only one contributor
// defines it at all, or every contributor that does happens to agree.
type MergeContributors<PerContributor extends Record<PropertyKey, object>> = {
  [K in AllContributedKeys<PerContributor>]: PerKeyAcrossContributors<
    PerContributor,
    K
  > extends infer PerKey
    ? IsEqual<PerKey, UnionToIntersection<PerKey>> extends true
      ? PerKey extends [infer V]
        ? V
        : never
      : SchemaError<`Duplicate definitions of '${K & string}' have incompatible types`>
    : never;
};

// Each option that has `.settings` contributes its OWN fully-flattened props
// (recursing through FlattenDef, not a separate shallower implementation).
// Options without `.settings` contribute `{}`, which has no keys and so is
// invisible to MergeContributors.
type OptionSubordinateProps<
  O extends Record<string, string | SelectOptionDef>,
> = MergeContributors<{
  [K in keyof O]: O[K] extends {
    settings: infer S extends WidgetSettingsDefinition;
  }
    ? FlattenDef<S>
    : {};
}>;

// One contributor per TOP-LEVEL key, each contributor's own object holding
// its own direct value (value-bearing cases only -- see the ValueCaseKind
// gate below) AND whatever its subordinate settings flatten to (select's
// options, group's own settings), all going through the SAME
// MergeContributors call.
type FlattenDef<TDef extends WidgetSettingsDefinition> = MergeContributors<{
  [K in keyof TDef]:
    // Non-value-bearing cases (group/trigger/marker/indicator etc.) contribute
    // nothing of their own here
    (TDef[K] extends { type: ValueCaseKind }
      ? // Checked before the generic default/required branches below: a
        // dynamic select's `default` can't be verified against anything --
        // there's no keyof-able options object until the generator actually
        // runs, so a `default` here isn't a narrower "which key" guarantee
        // the way it is for a static select, it's just an unchecked guess.
        // Rather than leave that hidden constraint in place, force the
        // author to use `required: true` instead (matches how the runtime
        // side already treats "no selection yet" -- see DynamicSelectRow's
        // reconciliation, which resets to no-selection, never to `default`).
        TDef[K] extends {
          type: "select";
          options: (...args: any[]) => any;
          default: any;
        }
        ? {
            [P in K]: SchemaError<`Setting '${K & string}' declares a default for a dynamic select; its option set isn't known until runtime -- use required: true instead`>;
          }
        : TDef[K] extends { default: any; required: true }
          ? {
              [P in K]: SchemaError<`Setting '${K & string}' declares both a default and required`>;
            }
          : TDef[K] extends { default: any }
            ? { [P in K]: ExtractSettingValue<TDef[K], K> }
            : { [P in K]: ExtractSettingValue<TDef[K], K> | undefined }
      : {}) &
    // The `infer O extends Record<...>` constraint is also what excludes a
    // dynamic (function-valued) select here, with no extra branch needed: a
    // function type doesn't satisfy that constraint, so this falls straight
    // to `{}` -- a dynamic select's options aren't known until runtime, so
    // there's no way to know what (if any) subordinate settings a specific
    // option would contribute at compile time.
    (TDef[K] extends {
      type: "select";
      options: infer O extends Record<string, string | SelectOptionDef>;
    }
      ? OptionSubordinateProps<O>
      : {}) &
    // A group's own `.settings` is just another WidgetSettingsDefinition,
    // flattened by recursing into FlattenDef itself -- same recursive shape
    // OptionSubordinateProps already uses for a select option's `.settings`.
    (TDef[K] extends {
      type: "group";
      settings: infer S extends WidgetSettingsDefinition;
    }
      ? FlattenDef<S>
      : {});
}>;

// If any property of Obj is itself a SchemaError, collapse the WHOLE type
// down to (the union of) those matched errors, instead of leaving them
// buried inside one field. Without this, a widget only sees the error when
// its own code happens to read the specific poisoned field. Applying this to
// WidgetSettingsProps means the error surfaces the moment a widget's own
// function signature destructures its props (typically the first few lines
// of the file, strictly before registerWidget is ever reached) -- once
// WidgetSettingsProps<S> itself IS the error type, destructuring any real
// field off it is a compile error immediately, since the error type has none
// of them.
//
// Returns the matched error(s) themselves (not the generic ErrorShape
// parameter) so the *actual* reason string is what shows up collapsed at the
// top level, not a generic "some SchemaError exists" with the specific
// message discarded.
type PropagateError<Obj extends object, ErrorShape> = Extract<
  ObjectValueOf<Obj>,
  ErrorShape
> extends infer Matched
  ? IsNever<Matched> extends true
    ? Obj
    : Matched
  : never;

export type WidgetSettingsProps<T extends WidgetSettingsDefinition> =
  PropagateError<FlattenDef<T>, SchemaError<string>>;
