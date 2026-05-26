import useInterval from "../../hooks/useInterval";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";

const QUOTE_WIDGET_SETTINGS_DEF = {
  updateUnit: {
    type: "select",
    label: "Update frequency unit",
    options: {
      minute: {
        label: "Minute",
        settings: {
          freq: {
            label: "Frequency",
            type: "number",
            default: 1,
            min: 1,
            max: 60,
            step: 1,
          },
        },
      },
      hour: {
        label: "Hour",
        settings: {
          freq: {
            label: "Frequency",
            type: "number",
            default: 1,
            min: 1,
            max: 24,
            step: 1,
          },
        },
      },
      day: {
        label: "Day",
        settings: {
          freq: {
            label: "Frequency",
            type: "number",
            default: 1,
            min: 1,
            max: 365,
            step: 1,
          },
        },
      },
    },
    default: "hour",
  },
} satisfies WidgetSettingsDefinition;

export function Quote(_props: WidgetSettingsProps<typeof QUOTE_WIDGET_SETTINGS_DEF>) {
  useInterval(getQuote, 60 * 60 * 1000);
  return (
    <div className="quote-widget">
      <p className="quote-text">
        Quote goes here. (WIP)
      </p>
    </div>
  );
}

const QuoteWidget = registerWidget(Quote, {
  id: "quote",
  name: "Quote",
  description: "Displays a quotes from a configuable source.",
  category: "general",
  tags: ["customizable", "requires setup"],
  settingsDef: QUOTE_WIDGET_SETTINGS_DEF,
  minSize: [null, null],
  maxSize: [null, null],
});

export default QuoteWidget;

function getQuote() {
  // Placeholder for fetching quote logic
}
