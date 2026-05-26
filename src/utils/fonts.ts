const BUNDLED_FONTS = ["Quicksand"];

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
]);

const FALLBACK_FONTS = [
  "Arial",
  "Arial Black",
  "Bahnschrift",
  "Calibri",
  "Cambria",
  "Candara",
  "Comic Sans MS",
  "Consolas",
  "Constantia",
  "Corbel",
  "Courier New",
  "Ebrima",
  "Franklin Gothic Medium",
  "Gabriola",
  "Gadugi",
  "Georgia",
  "HoloLens MDL2 Assets",
  "Impact",
  "Ink Free",
  "Javanese Text",
  "Leelawadee UI",
  "Lucida Console",
  "Lucida Sans Unicode",
  "Malgun Gothic",
  "Microsoft Himalaya",
  "Microsoft JhengHei",
  "Microsoft New Tai Lue",
  "Microsoft PhagsPa",
  "Microsoft Sans Serif",
  "Microsoft Tai Le",
  "Microsoft YaHei",
  "Microsoft Yi Baiti",
  "MingLiU-ExtB",
  "Mongolian Baiti",
  "MS Gothic",
  "MV Boli",
  "Myanmar Text",
  "Nirmala UI",
  "Palatino Linotype",
  "Segoe MDL2 Assets",
  "Segoe Print",
  "Segoe Script",
  "Segoe UI",
  "Segoe UI Historic",
  "Segoe UI Emoji",
  "Segoe UI Symbol",
  "SimSun",
  "Sitka",
  "Sylfaen",
  "Symbol",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "Webdings",
  "Wingdings",
  "Yu Gothic",
];

let cachedFonts: string[] | null = null;

export async function getInstalledFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;
  let families: string[];
  try {
    if ("queryLocalFonts" in window) {
      const fonts = await (
        window as Window & { queryLocalFonts: () => Promise<{ family: string }[]> }
      ).queryLocalFonts();
      families = [...new Set(fonts.map((f) => f.family))];
    } else {
      families = [...FALLBACK_FONTS];
    }
  } catch {
    families = [...FALLBACK_FONTS];
  }
  cachedFonts = [...new Set([...BUNDLED_FONTS, ...families])].sort((a, b) =>
    a.localeCompare(b),
  );
  return cachedFonts;
}

export function isGenericFamily(name: string): boolean {
  return GENERIC_FAMILIES.has(name.trim().toLowerCase().replace(/['"]/g, ""));
}

export function parseGenericFallback(
  value: string,
): { fonts: string[]; fallback: string } {
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const lastPart = parts[parts.length - 1] ?? "";
  if (parts.length > 0 && isGenericFamily(lastPart)) {
    return { fonts: parts.slice(0, -1), fallback: lastPart };
  }
  return { fonts: parts, fallback: "" };
}

export function buildFontValue(fonts: string[], fallback: string): string {
  const parts = fonts.filter(Boolean);
  if (fallback) parts.push(fallback);
  return parts.join(", ");
}
