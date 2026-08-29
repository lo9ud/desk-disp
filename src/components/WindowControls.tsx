import {
  XMarkIcon,
  Cog8ToothIcon,
  PencilSquareIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
  BugAntIcon,
} from "@heroicons/react/16/solid";
import { useState, useEffect } from "react";
import { useRuntime } from "../runtime/context";
import type { LayoutInfo, ThemeInfo } from "../ffi_types";
import styles from "./styles/WindowControls.module.css";
import { useEditMode } from "../context/EditModeContext";
import { logger } from "../utils/logger";
import { Button } from "../primitives/Button";
import { useDevMode } from "../context/DevModeContext";

const { warn } = logger("window-controls");

export default function WindowControls() {
  const runtime = useRuntime();
  const devMode = useDevMode();
  const { enterEditMode } = useEditMode();
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<LayoutInfo[]>([]);
  const [activeLayout, setActiveLayout] = useState<string | null>(null);
  const [themeUnsaved, setThemeUnsaved] = useState(false);
  const [monitorCount, setMonitorCount] = useState<number>(0);

  const handleThemeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__unsaved__") return;
    await runtime.themes.setActive(e.target.value || null);
  };

  const handleLayoutChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    await runtime.layouts.setActive(e.target.value || null);
  };

  useEffect(() => {
    runtime.themes.list().then(setThemes);
    runtime.layouts.list().then(setLayouts);
    runtime.window.getMonitorCount().then(setMonitorCount);
    runtime.config.get().then((c) => {
      setActiveTheme(c.active_theme ?? null);
      setActiveLayout(c.active_layout ?? null);
    });

    const offConfig = runtime.events.on("config::changed", (config) => {
      setActiveTheme(config.active_theme ?? null);
      setActiveLayout(config.active_layout ?? null);
      setThemeUnsaved(false);
      runtime.layouts.list().then(setLayouts);
    });
    const offTheme = runtime.events.on("theme::changed", ({ id }) => {
      if (id === "preview") setThemeUnsaved(true);
    });
    return () => {
      offConfig();
      offTheme();
    };
  }, [runtime]);

  return (
    <div className={styles.windowControls} data-onboarding="controls">
      <div className={styles.buttons}>
        <HoverWrapper
          Element={Button}
          variant="icon"
          onClick={() => runtime.window.exit()}
          hoverText="Exit"
          className={styles.exitButton}
          data-onboarding="exit"
        >
          <XMarkIcon />
        </HoverWrapper>
        <HoverWrapper
          Element={Button}
          variant="icon"
          onClick={() => runtime.window.toggleSettingsVisibility()}
          hoverText="Settings"
          data-onboarding="settings"
        >
          <Cog8ToothIcon />
        </HoverWrapper>
        {monitorCount > 1 && (
          <HoverWrapper
            Element={Button}
            variant="icon"
            hoverText="Switch Monitors"
            onClick={() =>
              runtime.window.nextMonitor().catch((e) => {
                warn("Failed to switch monitors", e);
              })
            }
            data-onboarding="switch"
          >
            <ArrowsRightLeftIcon />
          </HoverWrapper>
        )}
        <ControlSeparator />
        <HoverWrapper
          Element={Button}
          variant="icon"
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
          Element={Button}
          variant="icon"
          onClick={() => enterEditMode()}
          hoverText="Edit Layout"
          data-onboarding="edit"
        >
          <PencilSquareIcon />
        </HoverWrapper>
        <HoverWrapper
          Element={"div"}
          hoverText="Select Layout"
          className={styles.selector}
          data-onboarding="layout"
        >
          <span className={styles.selectorLabel}>Layout</span>
          <select
            name="layout"
            className={styles.selectorSelect}
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
        <ControlSeparator />
        <HoverWrapper
          Element={"div"}
          hoverText="Select Theme"
          className={styles.selector}
          data-onboarding="theme"
        >
          <span className={styles.selectorLabel}>Theme</span>
          <select
            name="theme"
            className={styles.selectorSelect}
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
        {devMode.active && (
          <>
            <ControlSeparator />
            <HoverWrapper
              Element={Button}
              variant="icon"
              hoverText="Show Dev Toolbox"
              onClick={() => (
                devMode.setToolboxSettings((s) => ({
                  ...s,
                  showToolbox: !s.showToolbox,
                })),
                console.log("clicked", devMode.toolboxSettings)
              )}
            >
              <BugAntIcon />
            </HoverWrapper>
          </>
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
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    >
      {children}
      {hovered && <span className={styles.hoverText}>{hoverText}</span>}
    </E>
  );
}

function ControlSeparator() {
  return <div className={styles.controlSeparator} />;
}
