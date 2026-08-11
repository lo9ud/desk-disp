import { useEffect, useRef, useState } from "react";
import styles from "./styles/DevModeToolbox.module.css";
import { ArrowsPointingOutIcon } from "@heroicons/react/24/solid";
import { useDevMode } from "../context/DevModeContext";
import { QuestionMarkCircleIcon } from "@heroicons/react/16/solid";
import { BackendEvents } from "../ipc";
import { EVENT_NAMES } from "../ipc/events";
import { listen } from "@tauri-apps/api/event";

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

type EventStats = Record<keyof BackendEvents, { count: number }>;

const unlistens: Awaited<ReturnType<typeof listen>>[] = [];
const eventStatsInitial: EventStats = Object.fromEntries(
  EVENT_NAMES.map((name) => [name, { count: 0 }]),
) as EventStats;
const startTime = new Date();
const eventStats = eventStatsInitial;
let rerender = () => {
  return;
};
(async () => {
  for (const eventName of EVENT_NAMES) {
    const unlisten = await listen(eventName, () => {
      eventStats[eventName].count++;
      rerender();
    });
    unlistens.push(unlisten);
  }
})();

export default function DevModeToolbox() {
  const { toolboxSettings, setToolboxSettings } = useDevMode();
  const [position, setPosition] = useState({ x: 30, y: 30 });
  const [, setRerender] = useState(0);

  rerender = () => setRerender((prev) => prev + 1);

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
      <EventStatsDisplay eventStats={eventStats} />
    </div>
  );
}

function EventStatsDisplay({ eventStats }: { eventStats: EventStats }) {
  const elapsed = (Date.now() - startTime.getTime()) / 1000;
  const sum = Object.values(eventStats).reduce(
    (acc, stats) => acc + stats.count,
    0,
  );
  return (
    <div className={styles.eventStats}>
      <div className={styles.eventStatsList}>
        <span className={styles.eventName}>Event</span>
        <span className={styles.eventCount}>Count</span>
        <span className={styles.eventRate}>Rate (/sec)</span>
        <span className={styles.eventPeriod}>Period (ms)</span>
        <hr />
        {Object.entries(eventStats).map(([eventName, stats]) => (
          <>
            <span key={`event-${eventName}`} className={styles.eventName}>
              {eventName}
            </span>
            <span
              key={`event-${eventName}-count`}
              className={styles.eventCount}
            >
              {stats.count}
            </span>
            <span key={`event-${eventName}-rate`} className={styles.eventRate}>
              {(elapsed > 0 && stats.count > 0) ? (stats.count / elapsed).toFixed(1): ""}
            </span>
            <span key={`event-${eventName}-period`} className={styles.eventPeriod}>
              {(elapsed > 0 && stats.count > 0) ? (1000 / (stats.count / elapsed)).toFixed(0) : ""}
            </span>
          </>
        ))}
        <hr />
        <span className={styles.eventName}>Total</span>
        <span className={styles.eventCount}>{sum}</span>
        <span className={styles.eventRate}>{(sum / elapsed).toFixed(1)}</span>
        <span className={styles.eventPeriod}>{(1000 / (sum / elapsed)).toFixed(0)}</span>
      </div>
    </div>
  );
}
