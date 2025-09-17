import { ReactElement, Suspense } from "react";
import "./App.css";
import { getCpuUsage, getMemoryUsage } from "./utils";
import { WidgetProps } from "./components/Widget";
import { ErrorBoundary } from "react-error-boundary";

// const FftBars = lazy(() => import("./components/FftBars"));
import FftBars from "./components/FftBars";
// const PerfBox = lazy(() => import("./components/PerfBox"));
import PerfBox from "./components/PerfBox";
// const Visualiser = lazy(() => import("./components/Visualiser"));
import Visualiser from "./components/Visualiser";
// const MediaInfo = lazy(() => import("./components/MediaInfo"));
import MediaInfo from "./components/MediaInfo";
// const TimeDate = lazy(() => import("./components/TimeDate"));
import TimeDate from "./components/TimeDate";
// const Disks = lazy(() => import("./components/Disks"));
import Disks from "./components/Disks";
// const Weather = lazy(() => import("./components/Weather"));
import Weather from "./components/Weather";
// const Networks = lazy(() => import("./components/Networks"));
import Networks from "./components/Networks";

// function Loading() {
//   const [dots, setDots] = useState(0);

//   useEffect(() => {
//     const interval = setInterval(() => {
//       setDots((d) => (d + 1) % 4);
//     }, 500);
//     return () => clearInterval(interval);
//   }, []);

//   const dotStr = ".".repeat(Math.min(dots, 2) + 1).padEnd(3, " ");
//   const loadingText = `Loading config${dotStr}`;
//   return (
//     <div className="app-splash">
//       <span className="loading">
//         <pre>
//           {loadingText.split("").map((char, i) => (
//             <span key={i}>{char}</span>
//           ))}
//         </pre>
//       </span>
//     </div>
//   );
// }

function ErrorDisplay({
  message,
  style,
}: {
  message: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="app-splash" style={style}>
      <span className="error">{message}</span>
    </div>
  );
}

export default function App() {
  // const [config, setConfig] = useState<Config | null>(null);
  // const [error, setError] = useState<string | null>(null);

  // useEffect(() => {
  //   getConfig()
  //     .then((data) => setConfig(data))
  //     .catch((err) => setError(err.message));
  // }, []);

  // if (error) {
  //   return <ErrorDisplay message={error} />;
  // }

  // if (!config) {
  //   return <Loading />;
  // }

  return (
    // <ConfigProvider config={config}>
    <Container>
      <Disks col={1} row={1} colSpan={1} rowSpan={2} />
      <Weather col={2} row={1} colSpan={5} rowSpan={1} />
      <Networks col={7} row={1} colSpan={1} rowSpan={2} />
      <TimeDate col={3} row={2} colSpan={3} rowSpan={1} />
      <MediaInfo col={3} row={3} colSpan={3} rowSpan={2} />
      <PerfBox
        col={2}
        row={5}
        colSpan={1}
        rowSpan={1}
        title="CPU"
        refresh={100}
        getter={getCpuUsage}
        args={[]}
        transform={async (v) => v ?? 0}
      />
      <Visualiser col={3} row={5} colSpan={3} rowSpan={1} component={FftBars} />
      <PerfBox
        col={6}
        row={5}
        colSpan={1}
        rowSpan={1}
        title="Memory"
        refresh={100}
        getter={getMemoryUsage}
        args={[]}
        transform={async (v) => (v ? (v[0] / v[1]) * 100 : 0)}
      />
    </Container>
    // </ConfigProvider>
  );
}

function Container<Children extends React.ReactElement<WidgetProps>[]>({
  children,
}: {
  children: Children;
}) {
  let { children: newChildren } = fillGrid<Children>(children);

  return (
    <div className="container">
      {newChildren.map((child, i) => {
        const { col, row, colSpan, rowSpan } = child.props;
        const style = {
          gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
          gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
        };
        return (
          <WidgetWrapper key={i} style={style}>
            {child}
          </WidgetWrapper>
        );
      })}
    </div>
  );
}

function WidgetWrapper({
  style,
  children,
}: {
  style: React.CSSProperties;
  children: React.ReactElement<WidgetProps>;
}) {
  //@ts-expect-error name does exist on type
  const name = children.type.name || "Unknown";
  return (
    <ErrorBoundary
      key={"err-boundary-"}
      fallbackRender={({ error }) => (
        <ErrorDisplay
          style={style}
          message={`Something went wrong: ${name}: ${error.message}`}
        />
      )}
    >
      <Suspense fallback={<span>Loading...</span>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function fillGrid<Children extends React.ReactElement<WidgetProps>[]>(
  children: Children
) {
  // Set CSS variables for grid dimensions
  const maxCol = Math.max(
    ...children.map((child) => child.props.col + (child.props.colSpan || 1) - 1)
  );
  const maxRow = Math.max(
    ...children.map((child) => child.props.row + (child.props.rowSpan || 1) - 1)
  );
  document.documentElement.style.setProperty("--grid-cols", String(maxCol));
  document.documentElement.style.setProperty("--grid-rows", String(maxRow));

  // Create a grid to track occupied cells
  let grid: {
    content: ReactElement<WidgetProps> | string | null;
    drawn: boolean;
  }[][] = Array.from({ length: maxRow }, () =>
    Array.from({ length: maxCol }, () => ({ content: null, drawn: false }))
  );

  // Populate the grid and check for overlaps
  for (const child of children) {
    //@ts-expect-error name does exist on type
    const name = child.type.name || "Unknown";
    const { col, row, colSpan = 1, rowSpan = 1 } = child.props;

    for (let r = row - 1; r < row - 1 + rowSpan; r++) {
      for (let c = col - 1; c < col - 1 + colSpan; c++) {
        if (grid[r][c].content) {
          console.warn(
            `Warning: Overlapping widgets at row ${r + 1}, col ${c + 1}`
          );
        }
        grid[r][c].content = name;
      }
    }

    grid[row - 1][col - 1].content = child;
  }

  // Fill empty cells with placeholders
  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      if (!grid[r][c].content) {
        grid[r][c].content = (
          <Box col={c + 1} row={r + 1} colSpan={1} rowSpan={1} />
        );
      }
    }
  }

  // Flatten the grid to get the final list of children
  const childrenList: ReactElement<WidgetProps>[] = [];
  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const { content, drawn } = grid[r][c];
      if (!drawn && content && typeof content !== "string") {
        childrenList.push(content);
        grid[r][c].drawn = true;
      }
    }
  }

  return { children: childrenList };
}

function Box({ col, row, colSpan, rowSpan }: Readonly<WidgetProps>) {
  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };
  return (
    <div className="widget-border" style={style}>
      {`(${col}, ${row})`}
    </div>
  );
}
