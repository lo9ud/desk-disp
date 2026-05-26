import { useSubscription } from "../../hooks";
import { Bar, PieChart, Readout } from "../../primitives";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";

const SWAP_WIDGET_SETTINGS_DEF = {
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

export function Swap({
  style,
  showDetail,
}: WidgetSettingsProps<typeof SWAP_WIDGET_SETTINGS_DEF>) {
  const { data } = useSubscription("system");
  return (
    <Readout
      title={showDetail ? "Swap Usage" : "Swap"}
      value={
        showDetail
          ? `${((Number(data?.memory.swap_used ?? 0n) / Number(data?.memory.swap_total ?? 1n)) * 100).toFixed(1)}%`
          : undefined
      }
      subtitle={
        showDetail &&
        `${(Number(data?.memory.swap_used ?? 0n) / 1024 ** 3).toFixed(1)} used of ${(Number(data?.memory.swap_total ?? 0n) / 1024 ** 3).toFixed(1)} GB total`
      }
    >
      {style === "bar" ? (
        <Bar
          value={
            (Number(data?.memory.swap_used ?? 0n) /
              Number(data?.memory.swap_total ?? 1n)) *
            100
          }
        />
      ) : (
        <PieChart
          value={
            (Number(data?.memory.swap_used ?? 0n) /
              Number(data?.memory.swap_total ?? 1n)) *
            100
          }
          label={!showDetail}
        />
      )}
    </Readout>
  );
}

const SwapWidget = registerWidget(Swap, {
  id: "swap",
  name: "Swap Usage",
  description: "Shows current swap usage",
  category: "system",
  tags: [],
  maxSize: [null, null],
  minSize: [null, null],
  settingsDef: SWAP_WIDGET_SETTINGS_DEF,
});

export default SwapWidget;
