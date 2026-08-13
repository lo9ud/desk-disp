/**
 * Type-level regression tests for the widget-settings type transform
 * (WidgetSettingsDefinition -> WidgetSettingsProps). Pure compile-time
 * assertions -- a failure here is a `tsc` error, not a runtime one. Run with
 * `pnpm typecheck`.
 *
 * Deliberately self-contained: every fixture below is a small hand-authored
 * settingsDef local to this file, not imported from a real widget. Editing a
 * real widget's settingsDef must never require touching this file -- these
 * exist to protect the flattening *machinery* (defRegistry.ts /
 * settingsSchema.ts), not to pin any particular widget's current shape.
 *
 * Each `test_*` export is unused by design (its only job is to fail to
 * compile if wrong) -- `export` is what exempts it from `noUnusedLocals`
 * (tsconfig.json already enables that), no separate test tsconfig needed.
 */
import {
  SchemaError,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "./defRegistry";

// ---------------------------------------------------------------------------
// Tiny hand-rolled type-assertion helpers (previously the `type-testing`
// package; removed since WidgetSettingsProps needed a workaround regardless --
// see Simplify below -- so a purpose-fit local version pulls its weight
// better than a dependency we're already patching around).
// ---------------------------------------------------------------------------

/**
 * Expands an intersection of object types into a single flat object type, so
 * the equality check below isn't tripped up by *how* a type was built (e.g.
 * `{a: string} & {} & {}` vs `{a: string}`) rather than *what it accepts*.
 * WidgetSettingsProps is always an intersection of several mapped-type
 * branches -- most resolve to `{}` for a simple settingsDef -- and stays
 * unsimplified until something forces expansion like this.
 *
 * Guarded to `T extends object` on purpose: mapping over `keyof T` for a
 * non-object T (e.g. `unknown`, whose `keyof` is `never`) collapses it to
 * `{}`, which would make this helper quietly treat `unknown` as equal to an
 * empty object -- a real bug caught while writing the tests below (see the
 * "colliding subordinate key" test's history for why that distinction
 * actually matters here, not just in the abstract).
 */
type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } : T;

/** True iff A and B are exactly the same type (not just mutually assignable), once both are simplified. */
type Equal<A, B> =
  (<T>() => T extends Simplify<A> ? 1 : 2) extends <
    T,
  >() => T extends Simplify<B> ? 1 : 2
    ? true
    : false;

/** Fails to compile unless T is exactly `true`. */
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// Primitive value types: default vs required, each SettingType case
// ---------------------------------------------------------------------------

const STRING_DEFAULT = {
  a: { type: "string", label: "A", default: "x" },
} satisfies WidgetSettingsDefinition;
export type test_string_default = Expect<
  Equal<WidgetSettingsProps<typeof STRING_DEFAULT>, { a: string }>
>;

const STRING_REQUIRED = {
  a: { type: "string", label: "A", required: true },
} satisfies WidgetSettingsDefinition;
export type test_string_required = Expect<
  Equal<WidgetSettingsProps<typeof STRING_REQUIRED>, { a: string | undefined }>
>;

const BOOLEAN_DEFAULT = {
  a: { type: "boolean", label: "A", default: false },
} satisfies WidgetSettingsDefinition;
export type test_boolean_default = Expect<
  Equal<WidgetSettingsProps<typeof BOOLEAN_DEFAULT>, { a: boolean }>
>;

const BOOLEAN_REQUIRED = {
  a: { type: "boolean", label: "A", required: true },
} satisfies WidgetSettingsDefinition;
export type test_boolean_required = Expect<
  Equal<
    WidgetSettingsProps<typeof BOOLEAN_REQUIRED>,
    { a: boolean | undefined }
  >
>;

const NUMBER_MIN_MAX_STEP = {
  a: { type: "number", label: "A", default: 5, min: 0, max: 10, step: 1 },
} satisfies WidgetSettingsDefinition;
export type test_number_minmaxstep = Expect<
  Equal<WidgetSettingsProps<typeof NUMBER_MIN_MAX_STEP>, { a: number }>
>;

const NUMBER_STEPS = {
  a: { type: "number", label: "A", default: 5, steps: [1, 5, 10] },
} satisfies WidgetSettingsDefinition;
export type test_number_steps = Expect<
  Equal<WidgetSettingsProps<typeof NUMBER_STEPS>, { a: number }>
>;

const NUMBER_WITH_UNIT_AND_REQUIRED = {
  a: {
    type: "number",
    label: "A",
    required: true,
    min: 0,
    max: 10,
    step: 1,
    unit: "px",
  },
} satisfies WidgetSettingsDefinition;
export type test_number_unit_and_required = Expect<
  Equal<
    WidgetSettingsProps<typeof NUMBER_WITH_UNIT_AND_REQUIRED>,
    { a: number | undefined }
  >
>;
// `unit` is presentation-only and must never leak into the value type -- the
// assertion above already proves that (still `number`, not e.g. `number` tagged
// with unit info), called out here since it's easy to regress silently.

// Both `default` and `required: true` present at once. Used to be rejected
// at the literal (a generic "not assignable" error); now compiles, and the
// contradiction becomes a SchemaError for that specific key instead of
// FlattenDef silently preferring `default` the way it (and collectDefaults)
// already did before this existed -- an unsignaled resolution turned into a
// named one, same motivation as the collision detector.
const BOTH_DEFAULT_AND_REQUIRED = {
  a: { type: "boolean", label: "A", default: false, required: true },
} satisfies WidgetSettingsDefinition;
export type test_both_default_and_required_becomes_schema_error = Expect<
  Equal<
    WidgetSettingsProps<typeof BOTH_DEFAULT_AND_REQUIRED>,
    SchemaError<"Setting 'a' declares both a default and required">
  >
>;

// ---------------------------------------------------------------------------
// Select: plain string options vs SelectOptionDef options, required
// ---------------------------------------------------------------------------

const SELECT_PLAIN_STRINGS = {
  a: { type: "select", label: "A", default: "x", options: { x: "X", y: "Y" } },
} satisfies WidgetSettingsDefinition;
export type test_select_plain_strings = Expect<
  Equal<WidgetSettingsProps<typeof SELECT_PLAIN_STRINGS>, { a: "x" | "y" }>
>;

const SELECT_LABELLED_NO_SUBSETTINGS = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: { x: { label: "X" }, y: { label: "Y" } },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_labelled_no_subsettings = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_LABELLED_NO_SUBSETTINGS>,
    { a: "x" | "y" }
  >
>;

const SELECT_REQUIRED = {
  a: {
    type: "select",
    label: "A",
    required: true,
    options: { x: "X", y: "Y" },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_required = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_REQUIRED>,
    { a: "x" | "y" | undefined }
  >
>;

// ---------------------------------------------------------------------------
// Select with subordinate settings on one, some, or colliding options
// ---------------------------------------------------------------------------

const SELECT_ONE_SUBORDINATE = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          b: {
            type: "number",
            label: "B",
            default: 1,
            min: 0,
            max: 5,
            step: 1,
          },
        },
      },
      y: "Y",
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_one_subordinate = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_ONE_SUBORDINATE>,
    { a: "x" | "y"; b: number }
  >
>;

// A subordinate setting with no default is optional at the flattened level,
// same rule as a top-level required field.
const SELECT_SUBORDINATE_REQUIRED = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: { b: { type: "string", label: "B", required: true } },
      },
      y: "Y",
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_subordinate_required = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_SUBORDINATE_REQUIRED>,
    { a: "x" | "y"; b: string | undefined }
  >
>;

// Two DIFFERENT options each contribute their own, disjoint subordinate key --
// both end up present in the flattened type unconditionally, not just when
// their owning option is selected. This is the "eagerly present regardless of
// relevance" behavior collectDefaults already relies on (see WidgetSettingsPanel.tsx)
// -- pinned here so a rewrite can't accidentally narrow it.
const SELECT_TWO_OPTIONS_DISJOINT_SUBORDINATES = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          b: {
            type: "number",
            label: "B",
            default: 1,
            min: 0,
            max: 5,
            step: 1,
          },
        },
      },
      y: {
        label: "Y",
        settings: { c: { type: "boolean", label: "C", default: false } },
      },
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_two_options_disjoint_subordinates = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_TWO_OPTIONS_DISJOINT_SUBORDINATES>,
    { a: "x" | "y"; b: number; c: boolean }
  >
>;

// Two different options reusing the SAME subordinate key name with incompatible
// value types used to collapse the ENTIRE flattened props type to `never` --
// not just the colliding key, everything, including the unrelated `a` key
// (FlattenDef combines its pieces with `&`, and a genuinely incompatible
// UnionToIntersection resolves to bare `never`, so `X & never` wiped out the
// whole result). Fixed in defRegistry.ts: OptionSubordinateProps now detects
// a real per-key disagreement explicitly (comparing each key's per-option
// contributions -- wrapped so a single option's own multi-valued field, e.g.
// a nested select's own options, isn't mistaken for a cross-option collision
// -- via IsEqual<PerKey, UnionToIntersection<PerKey>>) and substitutes a
// SchemaError carrying a readable reason for just that key, leaving every
// other key (including `a`) unaffected.
const SELECT_TWO_OPTIONS_COLLIDING_SUBORDINATE_KEY = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "p",
            options: { p: "P", q: "Q" },
          },
        },
      },
      y: {
        label: "Y",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "r",
            options: { r: "R", s: "S" },
          },
        },
      },
    },
  },
} satisfies WidgetSettingsDefinition;
// PropagateError collapses the WHOLE props type to the matched error once
// any field is a SchemaError -- not `{a: "x"|"y"; mode: SchemaError<...>}`
// anymore, just the error itself, so a widget destructuring `a` off its own
// props (which it very reasonably would, since `a` itself is fine) also
// fails immediately, rather than only failing once `mode` specifically gets
// used somewhere deep in the component.
export type test_select_colliding_subordinate_key_becomes_schema_error = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_TWO_OPTIONS_COLLIDING_SUBORDINATE_KEY>,
    SchemaError<"Duplicate definitions of 'mode' have incompatible types">
  >
>;

// Concrete proof the error surfaces where a real widget would actually hit
// it: indexing the UNRELATED, perfectly-valid `a` field off a collision-
// tainted props type must still fail -- not because `a` itself is wrong, but
// because there's no `a` property on a bare SchemaError to read at all. This
// is what "moved the error to registration/definition time" concretely
// means: a widget component's own function signature -- the first place it
// destructures its props, e.g. `function Widget({a, ...}: WidgetSettingsProps<...>)`
// -- is where this now fails, not wherever in the component body `mode`
// specifically happens to get read.
type _CollidingProps = WidgetSettingsProps<
  typeof SELECT_TWO_OPTIONS_COLLIDING_SUBORDINATE_KEY
>;
// @ts-expect-error -- no `a` property exists on a collapsed SchemaError
type _test_unrelated_field_unreachable = _CollidingProps["a"];

// Three options: two disagree on `mode`, the third doesn't define `mode` at
// all. Confirms collision detection doesn't require *every* option to define
// the key (a real limitation of a SharedUnionFields-only approach, which only
// keeps keys present in every union member -- this implementation compares
// per-option contributions directly instead, so a non-participating option
// doesn't hide a real disagreement between the two that do participate).
const SELECT_THREE_OPTIONS_PARTIAL_COLLISION = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "p",
            options: { p: "P", q: "Q" },
          },
        },
      },
      y: {
        label: "Y",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "r",
            options: { r: "R", s: "S" },
          },
        },
      },
      z: {
        label: "Z",
        settings: {
          other: { type: "boolean", label: "Other", default: false },
        },
      },
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_three_options_partial_collision = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_THREE_OPTIONS_PARTIAL_COLLISION>,
    SchemaError<"Duplicate definitions of 'mode' have incompatible types">
  >
>;

// Two INDEPENDENT top-level selects (not sibling options of one select) whose
// subordinate settings collide with each other -- the "simple" version of
// this bug, and a genuinely separate code path from the sibling-options case
// above (FlattenDef's own cross-top-level-key merge, not
// OptionSubordinateProps). Caught the exact same way, via the same
// MergeContributors used for both, after generalizing the fix rather than
// only patching the sibling-options call site.
const SELECT_TWO_TOPLEVEL_SELECTS_COLLIDING = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "p",
            options: { p: "P", q: "Q" },
          },
        },
      },
    },
  },
  b: {
    type: "select",
    label: "B",
    default: "y",
    options: {
      y: {
        label: "Y",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "r",
            options: { r: "R", s: "S" },
          },
        },
      },
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_two_toplevel_selects_colliding = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_TWO_TOPLEVEL_SELECTS_COLLIDING>,
    SchemaError<"Duplicate definitions of 'mode' have incompatible types">
  >
>;

// Three levels of select-within-select-within-select, with a real value at
// the innermost level. Proves FlattenDef recursing into itself for a select's
// own subordinate settings (rather than the old, separate, non-recursive
// SubordinateSettingProps) actually flattens all the way down, not just one
// level -- the previous implementation would have stopped at `c`'s own value
// (`"p"|"q"`) without ever flattening `c`'s *own* subordinate `d`.
const THREE_LEVELS_DEEP = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          c: {
            type: "select",
            label: "C",
            default: "p",
            options: {
              p: {
                label: "P",
                settings: { d: { type: "boolean", label: "D", default: true } },
              },
              q: "Q",
            },
          },
        },
      },
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_three_levels_deep_nesting_flattens_fully = Expect<
  Equal<
    WidgetSettingsProps<typeof THREE_LEVELS_DEEP>,
    { a: "x"; c: "p" | "q"; d: boolean }
  >
>;

// A "jagged" collision: a key defined once, 3 levels deep inside `a`'s own
// subordinate tree, and again as a completely unrelated top-level key --
// neither sibling options of one select nor sibling top-level selects, just
// two unrelated declarations that happen to flatten to the same name. This
// is what exposed the last real gap: FlattenDef used to combine each
// top-level key's own direct value with the aggregate of all
// subordinate-flattened keys via plain `&` across separate mapped-type
// branches, never through MergeContributors at all -- so this collision
// merged via raw intersection and collapsed straight to bare `never`, same
// bug as the other two, a third place still uncaught after generalizing for
// the first two. Fixed by folding every top-level key's direct value and its
// own subordinate contribution into one contributor apiece, then running
// every top-level key through the SAME MergeContributors call.
const SELECT_JAGGED_ANCESTOR_COLLISION = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          b: {
            type: "select",
            label: "B",
            default: "y",
            options: {
              y: { label: "Y", settings: { c: { type: "string", label: "C", default: "z" } } },
            },
          },
        },
      },
    },
  },
  c: { type: "number", label: "C again", default: 5, steps: [1, 5, 10] },
} satisfies WidgetSettingsDefinition;
export type test_select_jagged_ancestor_collision = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_JAGGED_ANCESTOR_COLLISION>,
    SchemaError<"Duplicate definitions of 'c' have incompatible types">
  >
>;

// Two options defining the SAME subordinate key with the SAME (not just
// compatible-looking, literally identical) type -- must merge cleanly, not
// get flagged as a collision. This is the other half of the comparison the
// collision detector makes (IsEqual<PerKey, UnionToIntersection<PerKey>>):
// two agreeing contributors intersect back down to themselves, same as one.
const SELECT_TWO_OPTIONS_AGREEING_SUBORDINATE_KEY = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "p",
            options: { p: "P", q: "Q" },
          },
        },
      },
      y: {
        label: "Y",
        settings: {
          mode: {
            type: "select",
            label: "Mode",
            default: "p",
            options: { p: "P", q: "Q" },
          },
        },
      },
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_select_two_options_agreeing_subordinate_key = Expect<
  Equal<
    WidgetSettingsProps<typeof SELECT_TWO_OPTIONS_AGREEING_SUBORDINATE_KEY>,
    { a: "x" | "y"; mode: "p" | "q" }
  >
>;

// Select nested inside another select's subordinate settings.
const NESTED_SELECT = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: {
      x: {
        label: "X",
        settings: {
          b: {
            type: "select",
            label: "B",
            default: "p",
            options: { p: "P", q: "Q" },
          },
        },
      },
      y: "Y",
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_nested_select = Expect<
  Equal<
    WidgetSettingsProps<typeof NESTED_SELECT>,
    { a: "x" | "y"; b: "p" | "q" }
  >
>;

// ---------------------------------------------------------------------------
// showWhen / enableWhen: neither form of SettingCondition affects the value type
// ---------------------------------------------------------------------------

const WITH_SHOW_WHEN_SCALAR_IS = {
  a: { type: "boolean", label: "A", default: false },
  b: {
    type: "boolean",
    label: "B",
    default: false,
    showWhen: { key: "a", is: true },
  },
} satisfies WidgetSettingsDefinition;
export type test_showWhen_scalar_is = Expect<
  Equal<
    WidgetSettingsProps<typeof WITH_SHOW_WHEN_SCALAR_IS>,
    { a: boolean; b: boolean }
  >
>;

const WITH_SHOW_WHEN_ARRAY_IS = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: { x: "X", y: "Y", z: "Z" },
  },
  b: {
    type: "boolean",
    label: "B",
    default: false,
    showWhen: { key: "a", is: ["x", "y"] },
  },
} satisfies WidgetSettingsDefinition;
export type test_showWhen_array_is = Expect<
  Equal<
    WidgetSettingsProps<typeof WITH_SHOW_WHEN_ARRAY_IS>,
    { a: "x" | "y" | "z"; b: boolean }
  >
>;

const WITH_SHOW_WHEN_PREDICATE = {
  a: { type: "boolean", label: "A", default: false },
  b: {
    type: "boolean",
    label: "B",
    default: false,
    showWhen: { when: (s) => !!s.a },
  },
} satisfies WidgetSettingsDefinition;
export type test_showWhen_predicate = Expect<
  Equal<
    WidgetSettingsProps<typeof WITH_SHOW_WHEN_PREDICATE>,
    { a: boolean; b: boolean }
  >
>;

const WITH_ENABLE_WHEN = {
  a: { type: "boolean", label: "A", default: false },
  b: {
    type: "select",
    label: "B",
    default: "x",
    options: { x: "X" },
    enableWhen: { key: "a", is: true },
  },
} satisfies WidgetSettingsDefinition;
export type test_enableWhen_does_not_affect_value_type = Expect<
  Equal<WidgetSettingsProps<typeof WITH_ENABLE_WHEN>, { a: boolean; b: "x" }>
>;

// ---------------------------------------------------------------------------
// End-to-end: several mechanisms combined at once, in the shape of a real
// widget's settingsDef complexity but not coupled to any actual widget file.
// ---------------------------------------------------------------------------

// Nested select with several subordinate fields, a mix of required/defaulted
// fields, min/max/step and steps number variants side by side, showWhen gating
// on a sibling within the same subordinate scope.
const END_TO_END_NESTED_MODES = {
  mode: {
    type: "select",
    label: "Mode",
    default: "advanced",
    options: {
      simple: "Simple",
      advanced: {
        label: "Advanced",
        settings: {
          precision: {
            type: "number",
            label: "Precision",
            default: 2,
            min: 0,
            max: 10,
            step: 1,
          },
          scale: {
            type: "number",
            label: "Scale",
            default: 1,
            steps: [1, 2, 4, 8],
          },
          customLabel: { type: "string", label: "Label", required: true },
          tint: {
            type: "select",
            label: "Tint",
            default: "none",
            options: { none: "None", warm: "Warm", cool: "Cool" },
          },
          tintStrength: {
            type: "number",
            label: "Tint strength",
            default: 50,
            min: 0,
            max: 100,
            step: 1,
            unit: "%",
            showWhen: { key: "tint", is: ["warm", "cool"] },
          },
        },
      },
    },
  },
  enabled: { type: "boolean", label: "Enabled", default: true },
} satisfies WidgetSettingsDefinition;
export type test_end_to_end_nested_modes = Expect<
  Equal<
    WidgetSettingsProps<typeof END_TO_END_NESTED_MODES>,
    {
      mode: "simple" | "advanced";
      precision: number;
      scale: number;
      customLabel: string | undefined;
      tint: "none" | "warm" | "cool";
      tintStrength: number;
      enabled: boolean;
    }
  >
>;

// Two independent top-level selects, each with their own subordinate settings,
// plus a required top-level field and a boolean -- exercises UnionToIntersection
// merging across top-level selects, not just within one select's own options.
const END_TO_END_TWO_INDEPENDENT_SELECTS = {
  source: {
    type: "select",
    label: "Source",
    default: "local",
    options: {
      local: {
        label: "Local",
        settings: { path: { type: "string", label: "Path", required: true } },
      },
      remote: {
        label: "Remote",
        settings: {
          host: { type: "string", label: "Host", required: true },
          port: {
            type: "number",
            label: "Port",
            default: 443,
            min: 1,
            max: 65535,
            step: 1,
          },
        },
      },
    },
  },
  format: {
    type: "select",
    label: "Format",
    default: "json",
    options: { json: "JSON", csv: "CSV" },
  },
  verbose: { type: "boolean", label: "Verbose", default: false },
} satisfies WidgetSettingsDefinition;
export type test_end_to_end_two_independent_selects = Expect<
  Equal<
    WidgetSettingsProps<typeof END_TO_END_TWO_INDEPENDENT_SELECTS>,
    {
      source: "local" | "remote";
      path: string | undefined;
      host: string | undefined;
      port: number;
      format: "json" | "csv";
      verbose: boolean;
    }
  >
>;

// ---------------------------------------------------------------------------
// Phase 2: group/trigger/marker/indicator -- structural, non-value-bearing
// cases. None of these should ever contribute their OWN key to
// WidgetSettingsProps (FlattenDef gates on ValueCaseKind for exactly this
// reason); a group's nested `.settings` should flatten to the top level the
// same way a select option's subordinate settings already do, participating
// in the same MergeContributors collision detection.
// ---------------------------------------------------------------------------

// A lone trigger: contributes nothing at all to the flattened props.
const TRIGGER_ONLY = {
  a: { type: "trigger", label: "A", run: () => {} },
} satisfies WidgetSettingsDefinition;
export type test_trigger_does_not_leak_own_key = Expect<
  Equal<WidgetSettingsProps<typeof TRIGGER_ONLY>, {}>
>;

// A lone marker: same, its own key never appears (only its rendered TEXT is
// derived from `compute`, which isn't part of the value type at all).
const MARKER_ONLY = {
  a: { type: "marker", label: "A", compute: () => "x" },
} satisfies WidgetSettingsDefinition;
export type test_marker_does_not_leak_own_key = Expect<
  Equal<WidgetSettingsProps<typeof MARKER_ONLY>, {}>
>;

// A lone indicator: same.
const INDICATOR_ONLY = {
  a: { type: "indicator", label: "A", compute: () => ({ state: "idle" }) },
} satisfies WidgetSettingsDefinition;
export type test_indicator_does_not_leak_own_key = Expect<
  Equal<WidgetSettingsProps<typeof INDICATOR_ONLY>, {}>
>;

// A group's own key ("g") never appears either -- only what's nested inside
// `settings` flattens through, same rule as trigger/marker/indicator above.
const GROUP_BASIC = {
  g: {
    type: "group",
    label: "G",
    settings: {
      b: { type: "boolean", label: "B", default: false },
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_group_does_not_leak_own_key_only_nested = Expect<
  Equal<WidgetSettingsProps<typeof GROUP_BASIC>, { b: boolean }>
>;

// group.validate / group.verify are present but must not perturb the value
// type -- they're read at render time (WidgetSettingsPanel.tsx's GroupRow),
// never part of what a widget's own props carry.
const GROUP_WITH_VALIDATE_AND_VERIFY = {
  g: {
    type: "group",
    label: "G",
    settings: {
      b: { type: "boolean", label: "B", default: false },
    },
    validate: (local) => (local.b ? true : "b must be set"),
    verify: {
      run: () => ({ state: "ok" }) as const,
      deps: ["b"],
    },
  },
} satisfies WidgetSettingsDefinition;
export type test_group_validate_and_verify_do_not_affect_value_type = Expect<
  Equal<WidgetSettingsProps<typeof GROUP_WITH_VALIDATE_AND_VERIFY>, { b: boolean }>
>;

// A group nested inside a group, mixed with a sibling trigger and a
// top-level field -- proves FlattenDef's group branch recurses (like
// OptionSubordinateProps already does for select) rather than only handling
// one level, and that non-value-bearing siblings stay invisible throughout.
const GROUP_NESTED_TWO_LEVELS = {
  outer: {
    type: "group",
    label: "Outer",
    settings: {
      inner: {
        type: "group",
        label: "Inner",
        settings: {
          c: { type: "string", label: "C", default: "x" },
        },
      },
      reset: { type: "trigger", label: "Reset", run: () => {} },
    },
  },
  enabled: { type: "boolean", label: "Enabled", default: true },
} satisfies WidgetSettingsDefinition;
export type test_group_nested_two_levels_flattens_fully = Expect<
  Equal<
    WidgetSettingsProps<typeof GROUP_NESTED_TWO_LEVELS>,
    { c: string; enabled: boolean }
  >
>;

// A group's nested settings collide with an unrelated top-level key -- same
// "jagged" shape as SELECT_JAGGED_ANCESTOR_COLLISION, proving group's
// recursive FlattenDef<S> call goes through the same MergeContributors as
// every other subordinate-flattening path, not a separate unprotected one.
const GROUP_COLLIDES_WITH_TOPLEVEL_KEY = {
  g: {
    type: "group",
    label: "G",
    settings: {
      c: { type: "string", label: "C", default: "x" },
    },
  },
  c: { type: "number", label: "C again", default: 5, steps: [1, 5, 10] },
} satisfies WidgetSettingsDefinition;
export type test_group_collides_with_toplevel_key = Expect<
  Equal<
    WidgetSettingsProps<typeof GROUP_COLLIDES_WITH_TOPLEVEL_KEY>,
    SchemaError<"Duplicate definitions of 'c' have incompatible types">
  >
>;

// One of everything, in one settingsDef -- only the two genuinely
// value-bearing keys (top-level `count` and the group's nested `label`)
// should reach WidgetSettingsProps.
const STRUCTURAL_CASES_END_TO_END = {
  count: { type: "number", label: "Count", default: 0, min: 0, max: 9, step: 1 },
  settings: {
    type: "group",
    label: "Settings",
    settings: {
      label: { type: "string", label: "Label", default: "" },
    },
  },
  refresh: { type: "trigger", label: "Refresh", run: () => {}, confirm: true },
  status: {
    type: "marker",
    label: "Status",
    compute: () => "ok",
    deps: ["count"],
  },
  health: {
    type: "indicator",
    label: "Health",
    compute: () => ({ state: "idle" }) as const,
  },
} satisfies WidgetSettingsDefinition;
export type test_structural_cases_end_to_end = Expect<
  Equal<
    WidgetSettingsProps<typeof STRUCTURAL_CASES_END_TO_END>,
    { count: number; label: string }
  >
>;

// ---------------------------------------------------------------------------
// Negative tests: settingsDef literals that must NOT typecheck. Positive tests
// above only prove the transform computes the right shape for valid input --
// they say nothing about whether the discriminated union actually rejects
// invalid input (e.g. a select carrying number-only fields). `@ts-expect-error`
// is TypeScript's native "this line must fail to compile" mechanism, already
// used the same way in WidgetSettingsPanel.tsx's collectDefaults -- if the
// annotated line stops erroring (the union quietly became more permissive),
// the unused-directive itself becomes a compile error, so this is a real,
// self-checking assertion, not a comment nobody re-verifies.
//
// Each fixture is `export`ed for the same noUnusedLocals reason as the
// test_* aliases above, even though nothing reads it afterward.
// ---------------------------------------------------------------------------

// Missing `label` entirely.
export const BAD_MISSING_LABEL = {
  // @ts-expect-error -- label is required on every entry
  a: { type: "boolean", default: false },
} satisfies WidgetSettingsDefinition;

// Neither `default` nor `required` present.
export const BAD_NEITHER_DEFAULT_NOR_REQUIRED = {
  // @ts-expect-error -- must supply exactly one of default / required
  a: { type: "boolean", label: "A" },
} satisfies WidgetSettingsDefinition;

// `default`'s runtime type doesn't match its own `type`. The error lands on
// the whole entry literal (not the `default` line specifically) -- this is
// a property-type-mismatch-against-a-union error, which TS reports at the
// outer object boundary, unlike the excess-property errors above which
// pinpoint the specific offending line.
export const BAD_DEFAULT_WRONG_PRIMITIVE = {
  a: {
    type: "number",
    label: "A",
    // @ts-expect-error -- default must be a number, not a string, for type: "number"
    default: "5",
    min: 0,
    max: 10,
    step: 1,
  },
} satisfies WidgetSettingsDefinition;

// number missing both numeric-range variants (neither min/max/step nor steps).
export const BAD_NUMBER_MISSING_RANGE = {
  // @ts-expect-error -- number requires either {min,max,step} or {steps}
  a: { type: "number", label: "A", default: 5 },
} satisfies WidgetSettingsDefinition;

// number supplying BOTH range variants at once.
export const BAD_NUMBER_BOTH_RANGE_VARIANTS = {
  a: {
    type: "number",
    label: "A",
    default: 5,
    min: 0,
    max: 10,
    step: 1,
    // @ts-expect-error -- min/max/step and steps are mutually exclusive
    steps: [1, 5, 10],
  },
} satisfies WidgetSettingsDefinition;

// select carrying number-only fields ("mixing up cases").
export const BAD_SELECT_WITH_NUMBER_FIELDS = {
  a: {
    type: "select",
    label: "A",
    default: "x",
    options: { x: "X" },
    // @ts-expect-error -- min/max/step belong to type: "number", not "select"
    min: 0,
    max: 10,
    step: 1,
  },
} satisfies WidgetSettingsDefinition;

// number carrying a select-only field ("mixing up cases", the other direction).
export const BAD_NUMBER_WITH_OPTIONS_FIELD = {
  a: {
    type: "number",
    label: "A",
    default: 5,
    min: 0,
    max: 10,
    step: 1,
    // @ts-expect-error -- options belongs to type: "select", not "number"
    options: { x: "X" },
  },
} satisfies WidgetSettingsDefinition;

// boolean carrying a select-only field.
export const BAD_BOOLEAN_WITH_OPTIONS_FIELD = {
  a: {
    type: "boolean",
    label: "A",
    default: false,
    // @ts-expect-error -- options belongs to type: "select", not "boolean"
    options: { x: "X" },
  },
} satisfies WidgetSettingsDefinition;

// `type` outside the closed SettingType union.
export const BAD_UNRECOGNIZED_TYPE = {
  a: {
    // @ts-expect-error -- "color" is not a member of SettingType
    type: "color",
    label: "A",
    default: "#fff",
  },
} satisfies WidgetSettingsDefinition;

// group missing `settings` entirely.
export const BAD_GROUP_MISSING_SETTINGS = {
  // @ts-expect-error -- settings is required for type: "group"
  g: { type: "group", label: "G" },
} satisfies WidgetSettingsDefinition;

// group carrying a value-bearing `default` -- group is not in ValueCaseKind,
// so it never gets a default/required branch at all.
export const BAD_GROUP_WITH_DEFAULT_FIELD = {
  g: {
    type: "group",
    label: "G",
    settings: { b: { type: "boolean", label: "B", default: false } },
    // @ts-expect-error -- group is not value-bearing, it has no `default`
    default: {},
  },
} satisfies WidgetSettingsDefinition;

// trigger missing `run`.
export const BAD_TRIGGER_MISSING_RUN = {
  // @ts-expect-error -- run is required for type: "trigger"
  a: { type: "trigger", label: "A" },
} satisfies WidgetSettingsDefinition;

// marker missing `compute`.
export const BAD_MARKER_MISSING_COMPUTE = {
  // @ts-expect-error -- compute is required for type: "marker"
  a: { type: "marker", label: "A" },
} satisfies WidgetSettingsDefinition;

// indicator missing `compute`.
export const BAD_INDICATOR_MISSING_COMPUTE = {
  // @ts-expect-error -- compute is required for type: "indicator"
  a: { type: "indicator", label: "A" },
} satisfies WidgetSettingsDefinition;

// indicator's compute returning a bare string instead of VerifyStatus --
// confirms marker/indicator aren't interchangeable despite both being
// "derived, read-only, mount-once resolved" (see settingsSchema.ts's
// "split, not overloaded" comment on WidgetSettingsCaseMap.indicator).
export const BAD_INDICATOR_COMPUTE_WRONG_RETURN_TYPE = {
  a: {
    type: "indicator",
    label: "A",
    // @ts-expect-error -- indicator.compute must return VerifyStatus, not string
    compute: () => "ok",
  },
} satisfies WidgetSettingsDefinition;

// Literal duplicate key within one settingsDef object -- plain TypeScript
// object-literal protection (not specific to WidgetSettingsDefinition), kept
// here as a "keys colliding" case since it's still a mistake this file's
// job is to confirm stays caught.
export const BAD_DUPLICATE_KEY = {
  a: { type: "boolean", label: "A", default: false },
  // @ts-expect-error -- duplicate property name "a" in the same object literal
  a: { type: "string", label: "A again", default: "x" },
} satisfies WidgetSettingsDefinition;

