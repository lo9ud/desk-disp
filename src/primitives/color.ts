export type IndicatorColor = "auto" | "success" | "warning" | "danger" | (string & {});

/** Returns a CSS color value for a given color token and fill percentage (0-100). */
export function indicatorColor(color: IndicatorColor, pct: number): string {
  if (color === "auto") return `hsl(${120 - pct * 1.2}, 65%, 50%)`;
  if (color === "success") return "var(--color-success)";
  if (color === "warning") return "var(--color-warning)";
  if (color === "danger") return "var(--color-danger)";
  return color;
}

export function indicatorColorStart(color: IndicatorColor): string {
  if (color === "auto") return "hsl(120, 65%, 50%)";
  if (color === "success") return "hsl(120, 65%, 28%)";
  if (color === "warning") return "hsl(45, 80%, 28%)";
  if (color === "danger") return "hsl(0, 65%, 28%)";
  return color;
}
