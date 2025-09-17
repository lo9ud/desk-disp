import { useHistory, useStat } from "../hooks";
import { NetworkInterface } from "../types";
import { getNetworkInterfaces } from "../utils";
import { WidgetProps } from "./Widget";

import styles from "./styles/Networks.module.css";
import { FaCircleArrowDown, FaCircleArrowUp } from "react-icons/fa6";

export default function Networks({ col, row, colSpan, rowSpan }: WidgetProps) {
  const refresh = 100;

  const networks = useStat<NetworkInterface[]>(
    getNetworkInterfaces,
    async (v) => v ?? [],
    [],
    refresh
  );

  const style = {
    gridColumn: `${col > 0 ? col : "auto"} / span ${colSpan ?? 1}`,
    gridRow: `${row > 0 ? row : "auto"} / span ${rowSpan ?? 1}`,
  };
  return (
    <div className={styles.networks} style={style}>
      {networks?.map((net) => (
        <Network key={net.name} net={net} refresh={refresh} />
      ))}
    </div>
  );
}

function Network({ net, refresh }: { net: NetworkInterface; refresh: number }) {
  const historyLength = Math.floor(1000 / refresh);
  const rxAvg =
    useHistory(net.received, historyLength).reduce((a, b) => b + a, 0) /
    historyLength;
  const txAvg =
    useHistory(net.transmitted, historyLength).reduce((a, b) => b + a, 0) /
    historyLength;

  const txMax = 50 * 1000 * 1000;
  const rxMax = 50 * 1000 * 1000;

  const rxPercent = Math.min((rxAvg / rxMax) * 100, 100);
  const txPercent = Math.min((txAvg / txMax) * 100, 100);

  return (
    <div key={net.name} className={styles.network}>
      <div className={styles.networkName}>{net.name}</div>
      <div className={styles.networkMac}>{net.mac_address}</div>
      <div className={styles.bars}>
        <div className={styles.tx}>
          <FaCircleArrowUp className={styles.icon} />
          <span className={styles.value}>
            {(txAvg / (1000 * 1000)).toFixed(2)}MB/s
          </span>
          <span className={styles.percent}>{txPercent.toFixed(0)}%</span>
          <div className={styles.bar} style={{ width: `${txPercent}%` }}></div>
        </div>
        <div className={styles.rx}>
          <FaCircleArrowDown className={styles.icon} />
          <span className={styles.value}>
            {(rxAvg / (1000 * 1000)).toFixed(2)}MB/s
          </span>
          <span className={styles.percent}>{rxPercent.toFixed(0)}%</span>
          <div className={styles.bar} style={{ width: `${rxPercent}%` }}></div>
        </div>
      </div>
    </div>
  );
}
