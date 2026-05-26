import { useHistory, useSubscription } from "../../hooks";
import { LineGraph, Readout } from "../../primitives";
import { registerWidget } from "../../registry/defRegistry";
import { formatBps } from "../../utils/format";

export function Upload() {
  const { data } = useSubscription("hardware");
  const tx =
    data?.networks.reduce((sum, iface) => sum + Number(iface.transmitted), 0) ??
    0;
  const txHistory = useHistory(tx);

  const peak = Math.max(...txHistory, 1);
  return (
    <Readout title="↑ Upload" value={formatBps(tx)}>
      <LineGraph
        values={txHistory}
        max={peak}
        color="hsl(280, 55%, 60%)"
        filled
        smooth
      />
    </Readout>
  );
}

const UploadWidget = registerWidget(Upload, {
  id: "upload",
  name: "Upload Speed",
  description: "Shows current network upload speed",
  category: "system",
  tags: [],
  maxSize: [null, null],
  minSize: [null, null],
  settingsDef: {},
});

export default UploadWidget;
