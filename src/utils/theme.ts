import { ThemeData, ThemeVar } from "../ffi_types";

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
