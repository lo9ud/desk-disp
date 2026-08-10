import { useEffect, useRef, useState } from "react";
import styles from "./styles/DevModeToolbox.module.css";
import { ArrowsPointingOutIcon } from "@heroicons/react/24/solid";
import { useDevMode } from "../context/DevModeContext";
import { QuestionMarkCircleIcon } from "@heroicons/react/16/solid";

function Grabber({
  setPosition,
}: {
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}) {
  const iconRef = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const icon = iconRef.current;
    if (!icon) return;

    function handlePointerMove(e: PointerEvent) {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }

    function handlePointerUp(e: PointerEvent) {
      dragStartRef.current = null;
      icon?.releasePointerCapture(e.pointerId);
    }

    icon.addEventListener("pointermove", handlePointerMove);
    icon.addEventListener("pointerup", handlePointerUp);
    return () => {
      icon.removeEventListener("pointermove", handlePointerMove);
      icon.removeEventListener("pointerup", handlePointerUp);
    };
  }, [setPosition]);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }

  return (
    <ArrowsPointingOutIcon
      ref={iconRef}
      className={styles.grabber}
      onPointerDown={handlePointerDown}
    />
  );
}

export default function DevModeToolbox() {
  const { toolboxSettings, setToolboxSettings } = useDevMode();
  const [position, setPosition] = useState({ x: 30, y: 30 });

  function toggle(setting: keyof typeof toolboxSettings) {
    setToolboxSettings((prev) => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  }

  const settings: Record<
    keyof Omit<typeof toolboxSettings, "showToolbox">,
    { name: string; hint?: string }
  > = {
    displayWidgetCells: {
      name: "Display widget cells",
    },
    displayWidgetUsedSpace: {
      name: "Display widget dimensions",
    },
    showMissingBackground: {
      name: "Show missing background",
      hint: "Display where widgets have no/a transparent background.",
    },
  } as const;

  return (
    <div
      className={styles.devModeToolbox}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.header}>
        <Grabber setPosition={setPosition} />
        <span>Dev Toolbox</span>
      </div>
      <div className={styles.content}>
        {
          Object.entries(settings)
            .flatMap(([key, desc]) => [
              <label key={key} className={styles.setting}>
                <input
                  type="checkbox"
                  checked={toolboxSettings[key as keyof typeof toolboxSettings]}
                  onChange={() => toggle(key as keyof typeof toolboxSettings)}
                />
                <span>
                  {desc.name}
                  {desc.hint && (
                    <QuestionMarkCircleIcon
                      className={styles.hintIcon}
                      title={desc.hint}
                    />
                  )}
                </span>
              </label>,
              <hr key={`${key}-hr`} />,
            ])
            .slice(0, -1) /* remove last <hr> */
        }
      </div>
    </div>
  );
}
