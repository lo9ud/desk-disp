const SI_PREFIX = {
  0: "",
  3: "K",
  6: "M",
  9: "G",
  12: "T"
}

export function formatMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const totalSecs = Math.floor(ms / 1000);
    const ss = (totalSecs % 60).toString().padStart(2, '0');
    const totalMins = Math.floor(totalSecs / 60);
    const mm = (totalMins % 60).toString().padStart(2, '0');
    const hh = Math.floor(totalMins / 60);
    return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatSI(num: number, unit: string) {
  const logVal = Math.log10(num);
  for (const [key, val] of Object.entries(SI_PREFIX)) {
    if (Number.parseInt(key) > logVal-3)
      return `${num.toFixed(1)} ${val}${unit}`
    num /= 1000
  }
  return `${num.toFixed(1)} T${unit}`
}

export function formatBps(bytesPerSec: number): string {
  return formatSI(bytesPerSec, "B/s")
}

export function combineClassNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}