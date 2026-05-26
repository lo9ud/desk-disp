import { useSubscription } from "../../hooks";
import { Readout } from "../../primitives";
import { registerWidget } from "../../registry/defRegistry";
import styles from "./styles/SystemTempWidget.module.css";

export function SystemTemp() {
  const { data } = useSubscription("hardware");
  const temp =
    data?.temperatures && (data.temperatures.length > 0
      ? Math.max(...data.temperatures.map((t) => t.current))
      : null);
  return (
    <div className={styles.container}>
      <Readout
        title="System Temp"
        value={temp ? `${temp}C` : "Not available"}
      />
    </div>
  );
}

const SystemTempWidget = registerWidget(SystemTemp, {
  id: "system_temp",
  name: "System Temperature",
  description: "Shows the peak system temperature",
  category: "system",
  tags: [],
  maxSize: [null, null],
  minSize: [null, null],
  settingsDef: {},
});

export default SystemTempWidget;
