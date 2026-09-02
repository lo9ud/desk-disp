import {
  XMarkIcon,
  Cog8ToothIcon,
  PencilSquareIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
  BugAntIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/16/solid";
import { useState, useEffect, useCallback, useRef } from "react";
import { useWindowEvent } from "../hooks/useWindowEvent";
import { useRuntime } from "../runtime/context";
import type { LayoutInfo, ThemeInfo } from "../ffi_types";
import styles from "./styles/WindowControls.module.css";
import { useEditMode } from "../context/EditModeContext";
import { logger } from "../utils/logger";
import { Button } from "../primitives/Button";
import { useDevMode } from "../context/DevModeContext";
import { useUiFlag } from "../ui/context";

const { warn } = logger("window-controls");

export default function WindowControls() {
  const runtime = useRuntime();
  const devMode = useDevMode();
  const revealed = useUiFlag("chromeRevealed", { own: true });
  const { enterEditMode } = useEditMode();

  // Pointer and focus are independent reasons to stay open, so the flag carries
  // their union rather than whichever fired last.
  const barRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const pointerDriven = useRef(false);
  const setRevealed = revealed.set;
  const syncRevealed = useCallback(() => {
    setRevealed(hovered.current || focused.current);
  }, [setRevealed]);

  useWindowEvent("blur", () => {
    // Only focus is given up here. Hover is left alone: another window taking
    // focus doesn't move the pointer, and clearing it would hide the bar out
    // from under a pointer still resting on it, with no leave event coming to
    // put it back. A native <select> popup is exempt entirely - it takes focus
    // while the user is still working in the bar.
    const active = document.activeElement;
    const inBar =
      active instanceof HTMLElement && barRef.current?.contains(active);
    if (inBar && active instanceof HTMLSelectElement) return;
    // Drop it rather than just forgetting it, or returning to this window
    // restores focus to whatever was clicked and re-reveals the bar.
    if (inBar) active.blur();
    focused.current = false;
    syncRevealed();
  });
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<LayoutInfo[]>([]);
  const [activeLayout, setActiveLayout] = useState<string | null>(null);
  const [themeUnsaved, setThemeUnsaved] = useState(false);
  const [monitorCount, setMonitorCount] = useState<number>(0);

  // A control keeps focus after a mouse interaction, which would hold the bar
  // open past the pointer leaving. Release it once the interaction is done, but
  // never when keys are driving it - that would fight the keyboard user.
  //
  // Buttons release on click and selects on change, deliberately: a select's
  // click is the dropdown opening, and blurring there would shut it before a
  // choice could be made.
  const releaseAfterPointerChange = (el: HTMLSelectElement) => {
    if (pointerDriven.current) el.blur();
  };

  const releaseButtonFocus = (e: React.MouseEvent) => {
    if (!pointerDriven.current) return;
    (e.target as HTMLElement).closest("button")?.blur();
  };

  const handleThemeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__unsaved__") return;
    releaseAfterPointerChange(e.target);
    await runtime.themes.setActive(e.target.value || null);
  };

  const handleLayoutChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    releaseAfterPointerChange(e.target);
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
    <div
      ref={barRef}
      className={styles.windowControls}
      data-onboarding="controls"
      data-revealed={revealed.value || undefined}
      data-suppressed={revealed.override === false || undefined}
      onPointerDown={() => {
        pointerDriven.current = true;
      }}
      onClick={releaseButtonFocus}
      onKeyDown={() => {
        pointerDriven.current = false;
      }}
      onPointerEnter={() => {
        hovered.current = true;
        syncRevealed();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        syncRevealed();
      }}
      onFocus={() => {
        focused.current = true;
        syncRevealed();
      }}
      onBlur={(e) => {
        // Opening a native <select> can report focus leaving with no
        // relatedTarget while the dropdown is still open; activeElement stays
        // inside the bar in that case.
        const next = (e.relatedTarget ?? document.activeElement) as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        focused.current = false;
        syncRevealed();
      }}
    >
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
              variant={devMode.toolboxSettings.showToolbox ? "icon_accent" : "icon"}
              hoverText="Show Dev Toolbox"
              onClick={() =>
                devMode.setToolboxSettings((s) => ({
                  ...s,
                  showToolbox: !s.showToolbox,
                }))
              }
            >
              <BugAntIcon />
            </HoverWrapper>
            <HoverWrapper
              Element={Button}
              variant={devMode.devRenderHarness ? "icon_accent" : "icon"}
              hoverText="Toggle Dev Render Harness"
              onClick={() => devMode.toggleDevRenderHarness()}
            >
              <WrenchScrewdriverIcon />
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
  const E = Element as React.ElementType; // NOSONAR - cast needed for JSX spread; TSC rejects LibraryManagedAttributes<T,any> without it
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
