import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";

const SETTINGS_TEST_SETTINGS_DEF = {
  stringSetting: {
    type: "string",
    label: "String Setting",
    default: "Default string",
  },
  numberSetting: {
    type: "number",
    label: "Number Setting",
    default: 42,
    min: 0,
    max: 100,
    step: 1,
  },
  booleanSetting: {
    type: "boolean",
    label: "Boolean Setting",
    default: true,
  },
  selectSetting: {
    type: "select",
    label: "Select Setting",
    default: "option1",
    options: {
      option1: "Option 1",
      option2: "Option 2",
      option3: "Option 3",
    },
  },
  group: {
    type: "group",
    label: "Group Setting",
    // Cross-field: reads two of its OWN subordinate settings together,
    // something no single field's own type could express on its own.
    validate: (local) => {
      const s2 = (local.stringSetting2 as string) ?? "";
      const n2 = (local.numberSetting2 as number) ?? 0;
      return s2.length <= n2
        ? true
        : `String Setting 2 ("${s2}", length ${s2.length}) is longer than Number Setting 2 (${n2}) allows`;
    },
    verify: {
      // Artificially variable delay -- proves useDebouncedAsyncValue's
      // generation-counter guard actually does something: without it, a
      // slow-resolving call landing after a faster later one would flicker
      // this status back to something stale. Change Number Setting 2
      // repeatedly and confirm it settles on the LAST value's result, not
      // whichever call happens to resolve last by chance.
      run: async (local) => {
        const delay = 150 + Math.random() * 1200;
        await new Promise((resolve) => setTimeout(resolve, delay));
        const n2 = (local.numberSetting2 as number) ?? 0;
        return n2 % 2 === 0
          ? {
              state: "ok" as const,
              detail: `numberSetting2 (${n2}) is even -- took ${Math.round(delay)}ms`,
            }
          : {
              state: "error" as const,
              detail: `numberSetting2 (${n2}) is odd -- took ${Math.round(delay)}ms`,
            };
      },
      deps: ["numberSetting2"],
    },
    settings: {
      stringSetting2: {
        type: "string",
        label: "String Setting 2",
        default: "Default string",
      },
      numberSetting2: {
        type: "number",
        label: "Number Setting 2",
        default: 42,
        min: 0,
        max: 100,
        step: 1,
      },
      innerGroup: {
        type: "group",
        label: "Inner Group Setting",
        settings: {
          stringSetting3: {
            type: "string",
            label: "String Setting 3",
            default: "Default string",
          },
        },
      },
    },
  },
  // The SSH-connection-style case: a trigger's ephemeral result read by its
  // OWN group's `validate` (pull, not the trigger pushing invalidity onto
  // individual fields), plus per-field `validate` on the two "unconstrained"
  // inputs (string/number) for their own straightforward format checks --
  // independent of the connection test, a value-add on its own.
  connectionGroup: {
    type: "group",
    label: "Connection Settings",
    validate: (local) => {
      const status = local.testConnection as
        | { state?: string; detail?: string }
        | undefined;
      return status?.state === "error"
        ? `Connection test failed: ${status.detail ?? "unknown error"}`
        : true;
    },
    settings: {
      host: {
        type: "string",
        label: "Host",
        default: "localhost",
        validate: (value) =>
          /^[a-zA-Z0-9.-]+$/.test(value)
            ? true
            : "Host must contain only letters, digits, dots, and hyphens",
      },
      port: {
        type: "number",
        label: "Port",
        default: 22,
        min: 1,
        max: 65535,
        step: 1,
        // A single min/max can't express "22, or 1024-49151" -- this is
        // exactly the kind of constraint validate exists for, beyond what
        // the range widget itself already enforces.
        validate: (value) =>
          value === 22 || (value >= 1024 && value <= 49151)
            ? true
            : "Port should be 22 (SSH) or a registered port (1024-49151)",
      },
      username: { type: "string", label: "Username", default: "" },
      password: { type: "string", label: "Password", default: "" },
      testConnection: {
        type: "trigger",
        label: "Test Connection",
        run: async (local) => {
          const host = (local.host as string) ?? "";
          const port = (local.port as number) ?? 0;
          await new Promise((resolve) =>
            setTimeout(resolve, 400 + Math.random() * 600),
          );
          return host.length > 0 && port > 0
            ? { state: "ok" as const, detail: `Reached ${host}:${port}` }
            : { state: "error" as const, detail: "Host and port are required" };
        },
        // A stale "ok" would be worse than useless here -- connectionGroup's
        // own validate trusts this result. Editing any of the four fields
        // this test actually covers resets it to idle, so it can never keep
        // claiming a connection that hasn't actually been retested.
        deps: ["host", "port", "username", "password"],
      },
    },
  },
  selectWithSettings: {
    type: "select",
    label: "Select with Settings",
    default: "option1",
    options: {
      option1: {
        label: "Option 1",
        settings: {
          stringSetting4: {
            type: "string",
            label: "String Setting 4",
            default: "Default string",
          },
        },
      },
      option2: "Option 2",
    },
  },
  // Dynamic select: the option SET itself is computed, re-run whenever
  // numberSetting changes (deps-driven, debounced). The artificial delay
  // makes stale-while-revalidate visible -- the previously-resolved options
  // stay on screen until the new set actually lands, never flashing empty.
  dynamicSelectSetting: {
    type: "select",
    label: "Dynamic Select Setting (depends on Number Setting)",
    // Dynamic selects can't declare `default` -- there's no options object
    // to verify a key against until the generator actually runs (see
    // settingsSchema.ts's FlattenDef). `required: true` is the honest
    // alternative: starts at no-selection instead of an unverified guess.
    required: true,
    options: async (local) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const base = (local.numberSetting as number) ?? 0;
      const count = (base % 4) + 1;
      return Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `item${i}`,
          `Item ${i} (Number Setting = ${base})`,
        ]),
      );
    },
    deps: ["numberSetting"],
  },
  // Dynamic string: suggestions computed from another field, fed into
  // TextInput's <datalist> via `auto`.
  dynamicStringSetting: {
    type: "string",
    label: "Dynamic String Setting (suggestions depend on String Setting)",
    default: "",
    suggestions: async (local) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const prefix = (local.stringSetting as string) ?? "";
      return [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`];
    },
    deps: ["stringSetting"],
  },
  // trigger.run may return a VerifyStatus, stored ephemerally (session-only,
  // never persisted) under this trigger's OWN key -- pull, not push (see
  // settingsSchema.ts's trigger case). triggerGatedSetting below reads it
  // via showWhen, same pattern the connectionGroup demo further down uses
  // for cross-field validate.
  triggerSetting: {
    type: "trigger",
    label: "Trigger Setting",
    confirm: true,
    run: async () => {
      console.log("Trigger setting activated!");
      await new Promise((resolve) => setTimeout(resolve, 300));
      return Math.random() > 0.3
        ? { state: "ok" as const, detail: `Ran at ${new Date().toLocaleTimeString()}` }
        : { state: "error" as const, detail: "Simulated failure -- try again" };
    },
  },
  triggerGatedSetting: {
    type: "boolean",
    label: "Only Shown After a Successful Trigger",
    default: false,
    showWhen: {
      when: (local) =>
        (local.triggerSetting as { state?: string } | undefined)?.state ===
        "ok",
    },
  },
  markerSetting: {
    type: "marker",
    label: "Marker Setting",
    compute: (settings) => {
      return `value of stringSetting: ${settings.stringSetting as string}`;
    },
    deps: ["stringSetting"],
  },
  indicatorSetting: {
    type: "indicator",
    label: "Indicator Setting",
    compute: (settings) => {
      const isGood = settings.booleanSetting as boolean;
      return {
        state: isGood ? "ok" : "error",
        detail: `value of booleanSetting: ${isGood}`,
      };
    },
    deps: ["booleanSetting"],
  },
} satisfies WidgetSettingsDefinition;

export function SettingsTest(
  settings: WidgetSettingsProps<typeof SETTINGS_TEST_SETTINGS_DEF>,
) {
  return (
    <div>
      <p>This widget doesn't do anything special.</p>
      <p>Open its settings to see the available options.</p>
      <div>
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      </div>
    </div>
  );
}

registerWidget(SettingsTest, {
  id: "settings_test",
  name: "Settings Test",
  description:
    "A widget for testing settings functionality. It doesn't do anything special, but it does display its current settings in a JSON block.",
  category: "general",
  tags: ["interactive"],
  settingsDef: SETTINGS_TEST_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});
