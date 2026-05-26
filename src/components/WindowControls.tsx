import {
  XMarkIcon,
  Cog8ToothIcon,
  PencilSquareIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
} from "@heroicons/react/16/solid";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useState, useEffect } from "react";
import { ipc, ipcListen } from "../ipc";
import type { LayoutInfo, ThemeInfo } from "../ffi_types";
import styles from "./styles/WindowControls.module.css";
import { combineClassNames } from "../utils/format";
import { useEditMode } from "../context/EditModeContext";
import { logger } from "../utils/logger";

const { warn } = logger("window-controls");

async function toggleSettings() {
  const win = await WebviewWindow.getByLabel("settings");
  if (!win) return;
  if (await win.isVisible()) {
    await win.hide();
  } else {
    await win.show();
    await win.setFocus();
  }
}

export default function WindowControls() {
  const { enterEditMode } = useEditMode();
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<LayoutInfo[]>([]);
  const [activeLayout, setActiveLayout] = useState<string | null>(null);
  const [themeUnsaved, setThemeUnsaved] = useState(false);
  const [monitorCount, setMonitorCount] = useState<number>(0);

  useEffect(() => {
    ipc.listThemes().then(setThemes);
    ipc.listLayouts().then(setLayouts);
    ipc.getMonitorCount().then(setMonitorCount);
    ipc.getConfig().then((c) => {
      setActiveTheme(c.active_theme ?? null);
      setActiveLayout(c.active_layout ?? null);
    });

    let unlistenConfig: (() => void) | null = null;
    let unlistenTheme: (() => void) | null = null;
    ipcListen("config::changed", (config) => {
      setActiveTheme(config.active_theme ?? null);
      setActiveLayout(config.active_layout ?? null);
      setThemeUnsaved(false);
      ipc.listLayouts().then(setLayouts);
    }).then((fn) => {
      unlistenConfig = fn;
    });
    ipcListen("theme::changed", ({ id }) => {
      if (id === "preview") setThemeUnsaved(true);
    }).then((fn) => {
      unlistenTheme = fn;
    });
    return () => {
      unlistenConfig?.();
      unlistenTheme?.();
    };
  }, []);

  async function handleThemeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === "__unsaved__") return;
    const id = e.target.value || null;
    await ipc.setActiveTheme(id);
  }

  async function handleLayoutChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value || null;
    await ipc.setActiveLayout(id);
  }

  return (
    <div className={styles.window_controls} data-onboarding="controls">
      <div className={styles.buttons}>
        <HoverWrapper
          Element={"button"}
          onClick={() => ipc.exitProgram()}
          hoverText="Exit"
          className={styles.exit_button}
          data-onboarding="exit"
        >
          <XMarkIcon />
        </HoverWrapper>
        <HoverWrapper
          Element={"button"}
          onClick={toggleSettings}
          hoverText="Settings"
          data-onboarding="settings"
        >
          <Cog8ToothIcon />
        </HoverWrapper>
        <HoverWrapper
          Element={"button"}
          onClick={() => enterEditMode()}
          hoverText="Edit Layout"
          data-onboarding="edit"
        >
          <PencilSquareIcon />
        </HoverWrapper>
        <HoverWrapper
          Element="button"
          hoverText="New Layout"
          onClick={() =>
            enterEditMode({
              newLayout: { id: crypto.randomUUID(), name: "New Layout" },
            })
          }
          data-onboarding="new-layout"
        >
          <PlusIcon />
        </HoverWrapper>
        <HoverWrapper
          Element={"div"}
          hoverText="Select Layout"
          className={styles.selector}
          data-onboarding="layout"
        >
          <span className={styles.selector_label}>Layout</span>
          <select
            name="layout"
            className={styles.selector_select}
            value={activeLayout ?? ""}
            onChange={handleLayoutChange}
          >
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </HoverWrapper>
        <HoverWrapper
          Element={"div"}
          hoverText="Select Theme"
          className={styles.selector}
          data-onboarding="theme"
        >
          <span className={styles.selector_label}>Theme</span>
          <select
            name="theme"
            className={styles.selector_select}
            value={themeUnsaved ? "__unsaved__" : (activeTheme ?? "dark")}
            onChange={handleThemeChange}
          >
            {themeUnsaved && (
              <option value="__unsaved__" disabled>
                (Unsaved)
              </option>
            )}
            {themes.map((t) => (
              <option
                key={t.id}
                value={t.id}
                disabled={t.id === activeTheme && !themeUnsaved}
              >
                {t.name}
              </option>
            ))}
          </select>
        </HoverWrapper>
        {monitorCount > 1 && (
          <HoverWrapper
            Element="button"
            hoverText="Switch Monitors"
            onClick={() =>
              ipc.switchMonitor().catch((e) => {
                warn("Failed to switch monitors", e);
              })
            }
            data-onboarding="switch"
          >
            <ArrowsRightLeftIcon />
          </HoverWrapper>
        )}
      </div>
    </div>
  );
}

type HoverWrapperProps<T extends React.ElementType> = {
  Element: T;
  hoverText: string;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "children">;

function HoverWrapper<T extends React.ElementType>({
  Element,
  hoverText,
  children,
  className,
  ...props
}: HoverWrapperProps<T>) {
  const [hovered, setHovered] = useState(false);
  const E = Element as React.ElementType; // NOSONAR — cast needed for JSX spread; TSC rejects LibraryManagedAttributes<T,any> without it
  return (
    <E
      className={combineClassNames(styles.control_button, className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    >
      {children}
      {hovered && <span className={styles.hover_text}>{hoverText}</span>}
    </E>
  );
}
