import { ThemeData, ThemeVar, WidgetPlacement } from "../ffi_types";
import { WidgetPlacementProps } from "../widgets/widget";

function themeVarCssLine(v: ThemeVar): string {
  switch (v.type) {
    case "color": return `  --color-${v.label}: ${v.value};`;
    case "font":  return `  --font-${v.label}: ${v.value.join(", ")};`;
  }
}

export function themeDataToCss(theme: ThemeData): string {
  const lines = theme.vars.map(themeVarCssLine).join("\n");
  return `:root {\n  color-scheme: ${theme.color_scheme};\n${lines}\n}`;
}

export function applyTheme(css: string) {
  let el = document.getElementById("user-theme") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "user-theme";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function widgetPlacementToProps(placement: WidgetPlacement): WidgetPlacementProps {
  return { col: placement.col, colSpan: placement.col_span, row: placement.row, rowSpan: placement.row_span };
}