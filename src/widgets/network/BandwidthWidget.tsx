import { registerWidget } from "../../registry/defRegistry";
import { Download } from "./DownloadWidget";
import { Upload } from "./UploadWidget";
import styles from "./styles/BandwidthWidget.module.css";

export function Bandwidth() {
  return (
    <div className={styles.container}>
      <Download />
      <Upload />
    </div>
  );
}

const BandwidthWidget = registerWidget(Bandwidth, {
  id: "bandwidth",
  name: "Bandwidth",
  description: "Shows network upload and download speeds",
  category: "system",
  tags: ["interactive"],
  settingsDef: {},
  minSize: [null, null],
  maxSize: [null, null],
});

export default BandwidthWidget;
