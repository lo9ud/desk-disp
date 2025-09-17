import { ErrorBoundary } from "react-error-boundary";
import { useStat } from "../hooks";
import { FrequencyReading } from "../types";
import { getMediaFrequencyData } from "../utils";

import styles from "./styles/Visualiser.module.css";
import { WidgetProps } from "./Widget";

export default function Visualiser({
  component: Component,
  col,
  row,
  colSpan,
  rowSpan,
}: Readonly<
  {
    component: React.ComponentType<{ data: FrequencyReading[] | null }>;
  } & WidgetProps
>) {
  const frequencyData = useStat<FrequencyReading[]>(
    getMediaFrequencyData,
    async (v) => v ?? [],
    [],
    50
  );

  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };

  return (
    <div className={styles.visualiser} style={style}>
      <ErrorBoundary fallbackRender={({ error }) => <span className="error">Error rendering visualiser: {error.message}</span>}>
        <Component data={frequencyData} />
      </ErrorBoundary>
    </div>
  );
}
