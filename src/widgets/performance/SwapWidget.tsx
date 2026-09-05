import { useSubscription } from "../../runtime";
import { Bar, PieChart, Readout } from "../../primitives";
import {
  registerWidget,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "../../registry/defRegistry";
import styles from "./styles/performance.module.css";

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
  const { data } = useSubscription("memory");
  return (
    <div className={styles.readoutContainer}>
      <Readout
        title={showDetail ? "Swap Usage" : "Swap"}
        value={
          showDetail
            ? `${((Number(data?.swap_used ?? 0n) / Number(data?.swap_total ?? 1n)) * 100).toFixed(1)}%`
            : undefined
        }
        subtitle={
          showDetail &&
          `${(Number(data?.swap_used ?? 0n) / 1024 ** 3).toFixed(1)} used of ${(Number(data?.swap_total ?? 0n) / 1024 ** 3).toFixed(1)} GB total`
        }
      >
        {style === "bar" ? (
          <Bar
            value={
              (Number(data?.swap_used ?? 0n) / Number(data?.swap_total ?? 1n)) *
              100
            }
          />
        ) : (
          <PieChart
            value={
              (Number(data?.swap_used ?? 0n) / Number(data?.swap_total ?? 1n)) *
              100
            }
            label={!showDetail}
          />
        )}
      </Readout>
    </div>
  );
}

registerWidget(Swap, {
  id: "swap",
  name: "Swap Usage",
  description: "Shows current swap usage",
  category: "system",
  tags: [],
  maxSize: [null, null],
  minSize: [null, null],
  presetsSettings: [
    {
      style: "bar",
      showDetail: false,
    },
    {
      style: "pie",
      showDetail: false,
    },
    {
      style: "pie",
      showDetail: true,
    },
  ],
  settingsDef: SWAP_WIDGET_SETTINGS_DEF,
});
