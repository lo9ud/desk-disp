import { CSSProperties, useEffect, useRef, useState } from "react";
import { ipc } from "../../ipc";
import type { ThemeData, ThemeInfo } from "../../ffi_types";
import pageStyles from "./styles/Settings.module.css";
import styles from "./styles/ThemeSection.module.css";
import { Button } from "../../primitives/Button";
import { combineClassNames } from "../../utils/format";
import {
  Bars3BottomLeftIcon,
  ChartBarIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/solid";
import { logger } from "../../utils/logger";

const {error} = logger("theme-section");

function colorFromVars(theme: ThemeData, label: string): string {
  const v = theme.vars.find((v) => v.type === "color" && v.label === label);
  return v?.type === "color" ? v.value : "#888";
}

interface ThemeSwatch {
  info: ThemeInfo;
  base: string;
  surface: string;
  border: string;
  textColor: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

export default function ThemeSection() {
  const [swatches, setSwatches] = useState<ThemeSwatch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [infos, cfg] = await Promise.all([
        ipc.listThemes(),
        ipc.getConfig(),
      ]);
      setActiveId(cfg.active_theme ?? null);
      const loaded = await Promise.all(
        infos.map(async (info) => {
          try {
            const data = await ipc.getTheme(info.id);
            return {
              info,
              base: colorFromVars(data, "base"),
              surface: colorFromVars(data, "surface"),
              border: colorFromVars(data, "border"),
              textColor: colorFromVars(data, "text"),
              accent: colorFromVars(data, "accent"),
              success: colorFromVars(data, "success"),
              warning: colorFromVars(data, "warning"),
              danger: colorFromVars(data, "danger"),
            };
          } catch {
            return {
              info,
              base: "magenta",
              surface: "cyan",
              border: "green",
              textColor: "black",
              accent: "blue",
              success: "green",
              warning: "orange",
              danger: "red",
            };
          }
        }),
      );
      setSwatches(loaded);
    }
    load();
  }, []);

  async function handleSelect(id: string) {
    setActiveId(id);
    await ipc.setActiveTheme(id);
  }

  function handleGenerateClick() {
    colorInputRef.current?.click();
  }

  async function handleColorPick(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    if (!hex) return;
    try {
      await ipc.generateTheme(hex);
      const infos = await ipc.listThemes();
      const cfg = await ipc.getConfig();
      setActiveId(cfg.active_theme ?? null);
      const loaded = await Promise.all(
        infos.map(async (info) => {
          try {
            const data = await ipc.getTheme(info.id);
            return {
              info,
              base: colorFromVars(data, "base"),
              surface: colorFromVars(data, "surface"),
              border: colorFromVars(data, "border"),
              textColor: colorFromVars(data, "text"),
              accent: colorFromVars(data, "accent"),
              success: colorFromVars(data, "success"),
              warning: colorFromVars(data, "warning"),
              danger: colorFromVars(data, "danger"),
            };
          } catch {
            return {
              info,
              base: "magenta",
              surface: "cyan",
              border: "green",
              textColor: "black",
              accent: "blue",
              success: "green",
              warning: "orange",
              danger: "red",
            };
          }
        }),
      );
      setSwatches(loaded);
    } catch (err) {
      error("Failed to generate theme:", err?.toString());
    }
  }

  return (
    <section className={pageStyles.section}>
      <div className={styles.header}>
        <Button variant="ghost" onClick={handleGenerateClick}>
          Generate from colour
        </Button>
        <input
          ref={colorInputRef}
          type="color"
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 0,
            height: 0,
            top: "100%",
            left: 0,
          }}
          onChange={handleColorPick}
        />
      </div>
      <div className={styles.swatchContainer}>
        {swatches.map(
          ({
            info,
            base,
            surface,
            border,
            textColor,
            accent,
            success,
            warning,
            danger,
          }) => {
            const isActive = info.id === activeId;
            const vars = {
              "--color-base": base,
              "--color-surface": surface,
              "--color-border": border,
              "--color-text": textColor,
              "--color-accent": accent,
              "--color-success": success,
              "--color-warning": warning,
              "--color-danger": danger,
            };
            return (
              <button
                key={info.id}
                onClick={() => handleSelect(info.id)}
                className={combineClassNames(
                  styles.swatch,
                  isActive && styles.active,
                )}
                title={info.name}
                style={vars as CSSProperties}
              >
                <div className={styles.swatchBase}>
                  <div className={styles.swatchSurface}>
                    <Bars3BottomLeftIcon className={styles.sampleIcon} />
                  </div>
                  <div className={styles.swatchSurface}>
                    <ChartBarIcon
                      className={combineClassNames(
                        styles.sampleIconSmall,
                        styles.accent,
                      )}
                    />
                    <ChartBarIcon
                      className={combineClassNames(
                        styles.sampleIconSmall,
                        styles.success,
                      )}
                    />
                    <ChartBarIcon
                      className={combineClassNames(
                        styles.sampleIconSmall,
                        styles.warning,
                      )}
                    />
                    <ChartBarIcon
                      className={combineClassNames(
                        styles.sampleIconSmall,
                        styles.error,
                      )}
                    />
                  </div>
                </div>
                <div
                  className={combineClassNames(
                    styles.swatchLabel,
                    isActive && styles.active,
                  )}
                >
                  {info.name}
                </div>
                {isActive && <CheckBadgeIcon className={styles.checkIcon} />}
              </button>
            );
          },
        )}
      </div>
    </section>
  );
}
