import { useHistory } from "../../hooks";
import { useSubscription } from "../../runtime";
import { LineGraph, Readout } from "../../primitives";
import { registerWidget } from "../../registry/defRegistry";
import { formatBps } from "../../utils/format";
import styles from "./styles/BandwidthWidget.module.css";

export function Download() {
  const { data } = useSubscription("networks");
  const rx = data?.reduce((sum, iface) => sum + Number(iface.received), 0) ?? 0;
  const rxHistory = useHistory(rx);

  const peak = Math.max(...rxHistory, 1);
  return (
    <div className={styles.container}>
      <Readout title="↓ Download" value={formatBps(rx)}>
        <LineGraph
          values={rxHistory}
          max={peak}
          color="hsl(200, 65%, 55%)"
          filled
          smooth
        />
      </Readout>
    </div>
  );
}

registerWidget(Download, {
  id: "download",
  name: "Download Speed",
  description: "Shows current network download speed",
  tags: [],
  category: "system",
  maxSize: [null, null],
  minSize: [null, null],
  settingsDef: {},
});
