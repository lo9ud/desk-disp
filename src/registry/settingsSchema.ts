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
// Deliberately just Record<string, unknown>, same shape SettingCondition's
// own `when` already uses -- not narrowed to the specific fields in scope,
// on purpose (settled during design: even a narrowed type wouldn't prove
// *relevance*, since collectDefaults already seeds defaults for every select
// option's subordinate settings regardless of which option is active, so a
// precisely-typed local would still be lying about which fields currently
// matter -- not worth chasing).
export type LocalValues = Record<string, unknown>;

// Shared status vocabulary for group.verify and the standalone `indicator`
// case -- both are "derived visual indicator," just at different scopes
// (verify: specifically a group's own composite correctness/connectivity;
// indicator: any standalone computed condition, not necessarily
// connectivity-related). Kept here, not a UI file -- its actual visual
// treatment doesn't exist yet (phase 2/3 render everything as plain text on
// purpose, see SettingRow) and doesn't need to for this type to be useful.
export type VerifyStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "ok"; detail?: string }
  | { state: "error"; detail?: string };

// A select's `options`, either the static form (phase 1/2) or a dynamic,
// deps-driven generator (phase 3) -- read by WidgetSettingsPanel.tsx's
// SelectRow to decide which of StaticSelectRow/DynamicSelectRow to render
// (see the "stable branch per component instance" reasoning already used for
// SettingRow's own case dispatch: which shape a given select IS never
// changes across that select's own lifetime, so branching BEFORE any hook is
// called, in a component that itself calls none, is safe).
export type SelectOptionsSource =
  | Record<string, string | SelectOptionDef>
  | ((
      local: LocalValues,
    ) =>
      | Record<string, string | SelectOptionDef>
      | Promise<Record<string, string | SelectOptionDef>>);

// ---------------------------------------------------------------------------
// Case map -> entry union
//
// Each case's own shape lives here, self-contained, instead of one big
// `&`-of-`|` alternation growing a new branch per capability (the old
// WidgetSetting<T> shape this replaced). group/trigger/marker/indicator
// (phase 2) sit alongside the original 4 value-bearing cases; phase 3 adds
// function-valued alternatives to string's `suggestions` and select's
// `options`, plus `deps` alongside each, without touching the assembly logic
// below -- ValueOf/ExtractSettingValue's select branch is the one place that
// needed a genuinely new rule (see below): a dynamic select's value type
// widens to plain `string`, since its actual keys aren't known until runtime.
// ---------------------------------------------------------------------------

export interface WidgetSettingsCaseMap {
  string: {
    // Presentation-only, like `unit` on number -- never affects the value
    // type (still plain `string` either way). Fed into TextInput's existing
    // `auto` prop (a <datalist>, not an enforced constraint) by StringRow.
    suggestions?: string[] | ((local: LocalValues) => string[] | Promise<string[]>);
    // Only meaningful when `suggestions` is function-valued -- same
    // "omitted means mount-once, not depends-on-everything" rule as
    // marker/indicator/group.verify below (see useDebouncedAsyncValue).
    deps?: string[];
    // Sync, own-value-only validation (a straight value add regardless of
    // groups -- regex hostname matching, format checks, etc.) -- scoped to
    // string/number specifically. select/boolean don't get one: a select's
    // legal values are already exactly its declared options, and a boolean
    // has nothing narrower than true/false to validate. Deliberately NOT
    // async/deps-driven like group.verify -- this is meant for cheap,
    // synchronous shape checks on the field's own value, not I/O; a
    // connection-test-style check belongs on a trigger/group.verify instead.
    validate?: (value: string, local: LocalValues) => true | string;
  };
  number: { unit?: string } & MergeExclusive<
    { min: number; max: number; step: number },
    { steps: number[] }
  > & {
    // See string.validate's comment -- same reasoning, own-value-only sync
    // check. Deliberately independent of min/max/step/steps: those gate the
    // RangeInput widget itself (what's draggable), this covers constraints a
    // single range can't express (e.g. "1-1023 or 49152-65535, not the gap
    // between").
    validate?: (value: number, local: LocalValues) => true | string;
  };
  boolean: {};
  select: {
    options: SelectOptionsSource;
    // Only meaningful when `options` is function-valued. A static select
    // has nothing to recompute, so a `deps` on one is simply inert -- not
    // worth a type-level ban for what's already a no-op.
    deps?: string[];
  };
  // Administrative: grouping + visibility + cross-field operations, not a
  // value-bearing case (excluded from ValueCaseKind below, so it never gets
  // default/required and never contributes its own key to WidgetSettingsProps
  // -- see FlattenDef). `settings` is just WidgetSettingsDefinition,
  // unbounded self-reference, same shape SelectOptionDef.settings already
  // uses -- no type-level nesting cap (a hard single-level cap would need
  // *more* machinery, a parallel restricted definition family, not less, and
  // would block legitimate multi-level use like Account > API Keys >
  // per-provider). The real antipattern worry -- someone nesting groups
  // absurdly deep -- is a UX/authoring concern, guarded at runtime instead
  // (see MAX_GROUP_DEPTH in defRegistry.ts's registerWidget).
  group: {
    settings: WidgetSettingsDefinition;
    validate?: (local: LocalValues) => true | string;
    verify?: {
      run: (local: LocalValues) => VerifyStatus | Promise<VerifyStatus>;
      deps?: string[];
    };
  };
  // One-shot action button. Not value-bearing itself in WidgetSettingsProps
  // (see the ValueCaseKind gate in FlattenDef below), but `run` may return a
  // VerifyStatus -- if it does, WidgetSettingsPanel.tsx stores it ephemerally
  // (session-only, never persisted) under this trigger's OWN key, exactly
  // like `indicator`'s deps-driven result except pulled by a manual click
  // instead of pushed by a deps change. That's what lets e.g. a group's own
  // `validate` (or a sibling's `showWhen`) read "did the last run of this
  // trigger succeed" -- a pull, not trigger.run writing anywhere itself.
  //
  // `deps` here means something different than everywhere else it appears
  // in this file: it does NOT re-fire `run` (a trigger only ever fires on a
  // click -- auto-firing it on a deps change would just make it a
  // deps-driven `indicator` with extra steps, undoing the whole point of
  // the manual/automatic split). It marks which settings the LAST result
  // was actually about -- if any of them change afterward, that result no
  // longer describes the current settings and TriggerRow resets it to
  // `{state: "idle"}` rather than continuing to show a claim that's gone
  // stale. A stale "ok" is actively misleading, not just out of date.
  trigger: {
    run: (local: LocalValues) => void | VerifyStatus | Promise<void | VerifyStatus>;
    confirm?: boolean;
    deps?: string[];
  };
  // Standalone derived read-only text. Not value-bearing. Kept separate from
  // `indicator` rather than having one case return `string | VerifyStatus`
  // and branch on the shape at render time -- that would reintroduce the
  // return-type alternation this whole redesign moves away from, plus a
  // runtime duck-type check, for a case split that's cheap to keep explicit
  // now that cases are cheap to add.
  marker: {
    compute: (local: LocalValues) => string | Promise<string>;
    deps?: string[];
  };
  // Standalone derived colored status -- any computed condition, not
  // necessarily connectivity (e.g. "value outside the recommended range"),
  // unlike group.verify which is specifically about a group's own composite
  // correctness. Not value-bearing.
  indicator: {
    compute: (local: LocalValues) => VerifyStatus | Promise<VerifyStatus>;
    deps?: string[];
  };
}

// The set of cases that produce a stored value (and so get default/required).
// Every current case qualifies; this stays meaningful once phase 2 adds
// cases that don't (group/trigger/marker/indicator), without needing to
// touch this line -- keyof SettingType is exactly the 4 value-bearing keys
// keyof WidgetSettingsCaseMap already is today, no coincidence: SettingType
// is what defines "a value-bearing case" means in the first place.
type ValueCaseKind = keyof SettingType;

// A case's own contributed value type, given its own extra shape. `select`'s
// keyof-options special case is the only one that isn't a direct SettingType
// lookup. Deliberately keyed on the case tag alone, not the whole entry
// shape -- unlike the old ExtractSettingValue, which had to structurally
// pattern-match an entire entry object each time, this only ever branches on
// the single literal K, because the case map already did the sorting.
//
// select's own O extends Function check (added phase 3): a dynamic
// (function-valued) `options` can't contribute known literal keys at compile
// time -- there's no set of options to take `keyof` of until the function
// actually runs -- so the value type widens to plain `string` instead. A
// static options object goes on exactly as before (keyof O).
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
    // instead of being rejected outright. This does NOT touch
    // WidgetSettingsCaseMap itself: `default`'s own type, just below, is
    // still computed from the CASE MAP's reference shape (options always
    // required there), so `default`'s allowed values are unaffected by what
    // an individual author happens to omit.
    (K extends "select" ? Partial<WidgetSettingsCaseMap[K]> : WidgetSettingsCaseMap[K]) &
    (K extends ValueCaseKind
      ? // At least one of default/required is still enforced (a literal with
        // neither structurally satisfies neither branch below), but unlike
        // the `?: never` version this replaced, both are now ALSO allowed to
        // be present together -- deliberately: the type-level exclusivity
        // used to just silently prefer `default` when both were given (both
        // FlattenDef and collectDefaults already do exactly that), an
        // unsignaled ambiguity rather than a rejected one. Letting the
        // literal compile and detecting "both present" downstream (see
        // FlattenDef) turns that silent resolution into a named SchemaError
        // instead.
        | { default: ValueOf<K, WidgetSettingsCaseMap[K]>; required?: true }
        | { required: true; default?: ValueOf<K, WidgetSettingsCaseMap[K]> }
      : {});
}[keyof WidgetSettingsCaseMap];

export interface WidgetSettingsDefinition {
  [settingKey: string]: WidgetSettingsEntry;
}

// WidgetSettingsEntry, but with select's `options` forced back to required.
// Safe to use anywhere the entry in hand is known to belong to an
// already-registered widget: a genuinely missing `options` would have
// already collapsed that widget's WidgetSettingsProps to a SchemaError,
// which means the widget's own component signature would have failed to
// compile -- so nothing reaches consumption points like the settings panel
// without `options` actually being present. This is the type-level half of
// "optional while authoring, required once resolved"; ExtractSettingValue is
// the value-level half (detects a real omission and reports it).
//
// `E = WidgetSettingsEntry` as a real type parameter (not a bare reference
// to WidgetSettingsEntry inside the conditional) is what makes this
// distribute over the union correctly -- distribution only happens over a
// naked type parameter of the alias being defined, not over an
// already-resolved named type used directly in a conditional's checked
// position, which would just test the union as a single whole instead of
// each member individually.
export type ResolvedWidgetSettingsEntry<E = WidgetSettingsEntry> = E extends {
  type: "select";
}
  ? E & { options: SelectOptionsSource }
  : E;

// Given a concrete entry (not a case-map lookup, an actual `{type, ...}`
// value) and the key it was declared under, read off its own contributed
// value type. Delegates to ValueOf for the 3 cases with nothing further to
// check; select gets its own explicit presence check here rather than
// through ValueOf, because ValueOf is also used to type `default` against
// the CASE MAP's reference shape (see WidgetSettingsEntry above), where
// `options` is deliberately still required -- baking a "missing means
// SchemaError" branch into ValueOf itself would apply there too and break
// `default`'s own type. Key is only used for naming the error; defaults to
// `PropertyKey` so callers that don't have a concrete key on hand (there
// aren't any today, but ValueOf's own schema-definition usage doesn't route
// through here at all) aren't forced to supply one.
//
// The final `: never` (not a SchemaError) is deliberate, unlike the
// `options` case just above: an unrecognized `type` can't actually reach
// here, because WidgetSettingsEntry's `type` stays a closed 4-literal union
// -- tried widening it to admit typos experimentally (so this branch would
// become reachable and get its own SchemaError), and it made things
// dramatically worse than the options case, not just narrower-in-scope: the
// permissive catch-all needed to tolerate arbitrary extra fields (`default`,
// `options`, etc., since which ones apply depends on the very `type` being
// typo'd) collapsed everything to `unknown` throughout WidgetSettingsPanel.tsx
// and AddWidgetModal.tsx (worse than options' narrow "possibly undefined"
// ripple), broke `typeof v === "object"` narrowing since `unknown` admits
// `null` too, AND accidentally swallowed all 7 of the unrelated "mixing up
// cases" negative tests as collateral damage, since the catch-all can't
// distinguish "wrong type" from "right type, wrong extra fields" once it's
// permissive enough to compile at all. Confirmed by actually trying it, not
// just reasoned about -- leaving this `never` alone and keeping unrecognized
// `type` as literal-rejection.
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
// type into uselessness (a genuinely incompatible UnionToIntersection
// doesn't just poison the one key, it collapses everything intersected with
// it to `never` too).
export type SchemaError<Reason extends string> = { readonly __schemaError: Reason };

// Generic collision-aware merge over a set of "contributors," each of which
// either contributes its own subordinate-props object or is irrelevant
// (contributes `{}`). This is the ONE merge primitive -- every place
// multiple contributions could collide (sibling options of one select,
// sibling top-level selects, multi-level nesting, a top-level key vs. an
// arbitrarily-deep subordinate key) routes through it. It took four rounds
// to actually cover every shape, each found by hand rather than by
// inspection -- see FlattenDef and OptionSubordinateProps below for what
// each one was. If a new nesting shape turns up later that this doesn't
// catch, generalize here again rather than patching a fifth call site.
type AllContributedKeys<PerContributor extends Record<PropertyKey, object>> = {
  [C in keyof PerContributor]: keyof PerContributor[C];
}[keyof PerContributor];

// What each contributor offers at key K, wrapped in a 1-tuple so the union
// below is a union of *contributors' offerings*, not a union of the literals
// inside any single contributor's own value -- an unwrapped union is
// indistinguishable from one contributor's own inherently multi-valued field
// (e.g. a nested select's own options) and produces false-positive
// collisions (confirmed the hard way against VisualizerWidget/AlbumArtWidget).
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
// They diverge only on a genuine disagreement, which becomes a SchemaError
// naming the specific key rather than silently corrupting the merge.
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
// MergeContributors call. A top-level key's direct value and the aggregate
// of everything flattened from subordinate options used to be combined via
// plain `&` instead -- which is exactly what let a top-level key collide,
// uncaught, with an unrelated key several levels deep inside some other
// select's subordinate tree.
type FlattenDef<TDef extends WidgetSettingsDefinition> = MergeContributors<{
  [K in keyof TDef]:
    // Non-value-bearing cases (group/trigger/marker/indicator) contribute
    // nothing of their own here -- they're not data a widget reads, and
    // without this gate they'd fall through to the "no default" branch
    // below and leak `{[key]: undefined}` into WidgetSettingsProps, a real
    // (if harmless-looking) key nothing actually meant to put there.
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
