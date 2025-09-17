import { useStat } from "../hooks";
import { DiskDetails } from "../types";
import { convertBytes, getDiskDetails } from "../utils";
import { WidgetProps } from "./Widget";
import { FaHardDrive } from "react-icons/fa6";

import styles from "./styles/Disks.module.css";

export default function Disks({
  col,
  row,
  colSpan,
  rowSpan,
}: Readonly<WidgetProps>) {
  const disks = useStat<DiskDetails[]>(
    getDiskDetails,
    (v) => Promise.resolve(v ?? []),
    [],
    1000
  );
  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };
  return (
    <div className={styles.disks} style={style}>
      {disks?.slice(0, 3).map((disk) => (
        <div key={disk.mount_point + disk.name} className={styles.disk}>
          <div className={styles.diskType}>
            <FaHardDrive className={styles.diskIcon} />
            <span className={styles.diskFileSystem}></span>
            {disk.file_system}
          </div>
          <span className={styles.diskName}>{disk.name || disk.kind}</span>
          <span className={styles.diskMount}>{disk.mount_point}</span>
          <span className={styles.diskUsage}>
            {convertBytes(disk.total_space - disk.available_space)} /{" "}
            {convertBytes(disk.total_space)}
          </span>
          <span className={styles.diskPercent}>
            {Math.round(
              ((disk.total_space - disk.available_space) / disk.total_space) *
                100
            )}
            %
          </span>
          <div className={styles.diskBar}>
            <div
              className={styles.diskBarFill}
              style={{
                width: `${Math.round(
                  ((disk.total_space - disk.available_space) /
                    disk.total_space) *
                    100
                )}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
