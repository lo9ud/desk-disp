export type WidgetProps = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

export function Widget({
  col,
  row,
  colSpan,
  rowSpan,
  children,
}: WidgetProps & { children: React.ReactNode }) {
  const style = {
    gridColumn: colSpan ? `${col} / span ${colSpan}` : `${col}`,
    gridRow: rowSpan ? `${row} / span ${rowSpan}` : `${row}`,
  };
  return (
    <div className="widget" style={style}>
      {children}
    </div>
  );
}
