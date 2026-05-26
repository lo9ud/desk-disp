import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";

const ERROR_TEST_SETTINGS_DEF = {
  throwOn: {
    type: "select",
    label: "Throw on",
    default: "render",
    options: {
      render: "Render",
      click: "Click",
    },
  },
} satisfies WidgetSettingsDefinition;

export function ErrorTest({
  throwOn,
}: WidgetSettingsProps<typeof ERROR_TEST_SETTINGS_DEF>) {
  if (throwOn === "render") {
    throw new Error("ErrorTestWidget: intentional render error");
  }

  return (
    <button
      onClick={() => {
        throw new Error("ErrorTestWidget: intentional click error");
      }}
    >
      Throw error
    </button>
  );
}

const ErrorTestWidget = registerWidget(ErrorTest, {
  id: "error_test",
  name: "Error Test",
  description: "Deliberately throws a render error to verify widget error boundary behavior.",
  category: "general",
  tags: ["customizable", "interactive"],
  settingsDef: ERROR_TEST_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});

export default ErrorTestWidget;
