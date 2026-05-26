import { registerWidget, WidgetSettingsDefinition, WidgetSettingsProps } from "../../registry/defRegistry";
import { combineClassNames } from "../../utils/format";
import { CPU } from "./CPUWidget";
import { Memory } from "./MemoryWidget";
import { Swap } from "./SwapWidget";
import styles from "./styles/PerformanceWidget.module.css";

const PERFORMANCE_WIDGET_SETTINGS_DEF = {
  style: {
    label: "Style",
    type: "select",
    options: {
      simple: "Simple",
      dense: "Dense",
    }
  }
} satisfies WidgetSettingsDefinition;

export function Performance({ style }: WidgetSettingsProps<typeof PERFORMANCE_WIDGET_SETTINGS_DEF>) {
  const [innerStyle, outerStyle, showDetail] = ({
    simple: ["pie", styles.simple, false],
    dense: ["bar", styles.dense, true],
  } as const)[style ?? "simple"];
  return (
    <div className={combineClassNames(styles.container, outerStyle)}>
      <CPU style={innerStyle} showDetail={showDetail} />
      <Memory style={innerStyle} showDetail={showDetail} />
      <Swap style={innerStyle} showDetail={showDetail} />
    </div>
  );
}

const PerformanceWidget = registerWidget(Performance, {
  id: "performance",
  name: "Performance",
  description: "Shows CPU, memory, and swap usage",
  category: "system",
  tags: [],
  maxSize: [null, null],
  minSize: [null, null],
  settingsDef: PERFORMANCE_WIDGET_SETTINGS_DEF,
});

export default PerformanceWidget;
