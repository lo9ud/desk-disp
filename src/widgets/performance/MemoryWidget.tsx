import { useSubscription } from "../../hooks";
import { Bar, PieChart, Readout } from "../../primitives";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";

const MEMORY_WIDGET_SETTINGS_DEF = {
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

export function Memory({
  style,
  showDetail,
}: WidgetSettingsProps<typeof MEMORY_WIDGET_SETTINGS_DEF>) {
  const { data } = useSubscription("system");
  return (
    <Readout
      title={showDetail ? "Memory Usage" : "Memory"}
      value={
        showDetail
          ? `${((Number(data?.memory.used ?? 0n) / Number(data?.memory.total ?? 1n)) * 100).toFixed(1)}%`
          : undefined
      }
      subtitle={
        showDetail &&
        `${(Number(data?.memory.used ?? 0n) / 1024 ** 3).toFixed(1)} used of ${(Number(data?.memory.total ?? 0n) / 1024 ** 3).toFixed(1)} GB total`
      }
    >
      {style === "bar" ? (
        <Bar
          value={
            (Number(data?.memory.used ?? 0n) /
              Number(data?.memory.total ?? 1n)) *
            100
          }
        />
      ) : (
        <PieChart
          value={
            (Number(data?.memory.used ?? 0n) /
              Number(data?.memory.total ?? 1n)) *
            100
          }
          label={!showDetail}
        />
      )}
    </Readout>
  );
}

const MemoryWidget = registerWidget(Memory, {
  id: "memory",
  name: "Memory Usage",
  description: "Shows current memory usage",
  category: "system",
  tags: [],
  maxSize: [null, null],
  minSize: [null, null],
  settingsDef: MEMORY_WIDGET_SETTINGS_DEF,
});

export default MemoryWidget;
