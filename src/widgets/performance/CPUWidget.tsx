import { useSubscription } from "../../hooks";
import { Bar, PieChart, Readout } from "../../primitives";
import {
  registerWidget,
  WidgetSettingsProps,
  WidgetSettingsDefinition,
} from "../../registry/defRegistry";

const CPU_SETTINGS_DEF = {
  style: {
    label: "Style",
    type: "select",
    options: {
      bar: "Bar",
      pie: "Pie",
    },
    default: "bar",
  },
  showDetail: {
    label: "Show Detail",
    type: "boolean",
    default: true,
  },
} satisfies WidgetSettingsDefinition;

export function CPU({
  style,
  showDetail,
}: WidgetSettingsProps<typeof CPU_SETTINGS_DEF>) {
  const { data } = useSubscription("system");
  return (
    <Readout
      title={showDetail ? "CPU Usage" : "CPU"}
      value={showDetail ? `${data?.cpu.global_usage.toFixed(1)}%` : undefined}
      subtitle={showDetail && data?.cpu.processors?.[0]?.brand}
    >
      {style === "bar" ? (
        <Bar value={data?.cpu?.global_usage || 0} />
      ) : (
        <PieChart value={data?.cpu?.global_usage || 0} label={!showDetail} />
      )}
    </Readout>
  );
}

const CPUWidget = registerWidget(CPU, {
  id: "cpu",
  name: "CPU Usage",
  description: "Shows current CPU usage",
  settingsDef: CPU_SETTINGS_DEF,
  tags: ["customizable"],
  category: "system",
  maxSize: [null, null],
  minSize: [null, null],
});

export default CPUWidget;
