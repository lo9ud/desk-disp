import { useDevMode } from "../../context/DevModeContext";
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
  triggerSetting: {
    type: "trigger",
    label: "Trigger Setting",
    confirm: true,
    run: () => {
      console.log("Trigger setting activated!");
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

const SettingsTestWidget = registerWidget(SettingsTest, {
  id: "settings_test",
  name: "Settings Test",
  description:
    "A widget for testing settings functionality. It doesn't do anything special, but it does display its current settings in a JSON block.",
  category: "general",
  tags: ["customizable", "interactive"],
  settingsDef: SETTINGS_TEST_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});

export default SettingsTestWidget;
