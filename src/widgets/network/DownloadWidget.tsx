import { useHistory, useSubscription } from "../../hooks";
import { LineGraph, Readout } from "../../primitives";
import { registerWidget } from "../../registry/defRegistry";
import { formatBps } from "../../utils/format";

export function Download() {
  const { data } = useSubscription("hardware");
  const rx =
    data?.networks.reduce((sum, iface) => sum + Number(iface.received), 0) ?? 0;
  const rxHistory = useHistory(rx);

  const peak = Math.max(...rxHistory, 1);
  return (
    <Readout title="↓ Download" value={formatBps(rx)}>
      <LineGraph
        values={rxHistory}
        max={peak}
        color="hsl(200, 65%, 55%)"
        filled
        smooth
      />
    </Readout>
  );
}

const DownloadWidget = registerWidget(Download, {
  id: "download",
  name: "Download Speed",
  description: "Shows current network download speed",
  tags: [],
  category: "system",
  maxSize: [null, null],
  minSize: [null, null],
  settingsDef: {},
});

export default DownloadWidget;
