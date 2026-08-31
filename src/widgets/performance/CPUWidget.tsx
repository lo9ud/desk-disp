import { useSubscription } from "../../hooks";
import { Bar, PieChart, Readout } from "../../primitives";
import {
  registerWidget,
  WidgetSettingsProps,
  WidgetSettingsDefinition,
} from "../../registry/defRegistry";
import styles from "./styles/performance.module.css";

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
  const { data } = useSubscription("cpu");
  return (
    <div className={styles.readoutContainer}>
      <Readout
        title={showDetail ? "CPU Usage" : "CPU"}
        value={showDetail ? `${data?.global_usage.toFixed(1)}%` : undefined}
        subtitle={showDetail && data?.processors?.[0]?.brand}
      >
        {style === "bar" ? (
          <Bar value={data?.global_usage || 0} />
        ) : (
          <PieChart value={data?.global_usage || 0} label={!showDetail} />
        )}
      </Readout>
    </div>
  );
}

const CPUWidget = registerWidget(CPU, {
  id: "cpu",
  name: "CPU Usage",
  description: "Shows current CPU usage",
  settingsDef: CPU_SETTINGS_DEF,
  tags: [],
  category: "system",
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
});

export default CPUWidget;
