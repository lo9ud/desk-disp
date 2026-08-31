import { XMarkIcon } from "@heroicons/react/16/solid";
import { useLayoutEffect, useRef, useState } from "react";
import {
  SettingsForm,
  useEphemeralValues,
} from "../../WidgetSettingsPanel";
import { getWidgetDefinition } from "../../../registry/defRegistry";
import { InstanceRegistry } from "../../../registry/instanceRegistry";
import { collectDefaults } from "../../../registry/settingsDefaults";
import { beginDragCursor, endDragCursor } from "../dragCursor";
import styles from "../styles/settingsPanel.module.css";
import { placePanel, Rect } from "../../../utils/placement";

const PANEL_W = 360;
const PANEL_MAX_H = 520;

export function SettingsPanel({
  instanceId,
  registry,
  anchor,
  bounds,
  onChange,
  onClose,
}: {
  instanceId: string;
  registry: InstanceRegistry;
  /** The edited widget's rect, in viewport pixels. */
  anchor: Rect | null;
  /** Area the panel may occupy on the grid, so it never covers band UI. */
  bounds: Rect | null;
  onChange: (id: string, settings: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const inst = registry.get(instanceId);
  const def = inst ? getWidgetDefinition(inst.definitionId) : undefined;

  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragged, setDragged] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...(def?.settingsDef ? collectDefaults(def.settingsDef) : {}),
    ...inst?.settings,
  }));
  const { ephemeral, setEphemeral } = useEphemeralValues();

  // Placement runs against the panel's real height, so a short form doesn't
  // get positioned as though it were full height.
  useLayoutEffect(() => {
    if (dragged || !anchor || !bounds) return;
    const h = panelRef.current?.offsetHeight ?? PANEL_MAX_H;
    const { rect } = placePanel(anchor, { w: PANEL_W, h }, bounds);
    setPos({ x: rect.x, y: rect.y });
  }, [anchor, bounds, dragged]);

  if (!inst || !def?.settingsDef || Object.keys(def.settingsDef).length === 0) {
    return null;
  }

  function handleChange(key: string, val: unknown) {
    const next = { ...values, [key]: val };
    setValues(next);
    onChange(instanceId, next);
  }

  function handleDragPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setDragged(true);
    beginDragCursor("grabbing");
  }

  function handleDragPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const w = panelRef.current?.offsetWidth ?? PANEL_W;
    const h = panelRef.current?.offsetHeight ?? PANEL_MAX_H;
    setPos({
      x: Math.min(Math.max(e.clientX - d.dx, 0), window.innerWidth - w),
      y: Math.min(Math.max(e.clientY - d.dy, 0), window.innerHeight - h),
    });
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    endDragCursor();
  }

  return (
    <>
      {/* Invisible click-catcher: clicking away closes the panel, and the
          click is consumed rather than falling through to the canvas, where
          it would deselect, start a drag, or open the add rail. */}
      <div
        className={styles.backdrop}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={panelRef}
        className={styles.panel}
        data-onboarding="widget-settings-panel"
        // Position is inherently dynamic; everything else lives in the module.
        style={{
          width: PANEL_W,
          maxHeight: PANEL_MAX_H,
          left: pos?.x ?? 0,
          top: pos?.y ?? 0,
          // Avoid a flash at (0,0) before the first placement lands.
          visibility: pos ? "visible" : "hidden",
        }}
        data-no-drag
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={styles.header}
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className={styles.title}>
            {def.name} (<code>{instanceId}</code>)
          </span>
          <button
            type="button"
            className={styles.closeButton}
            title="Close settings"
            onClick={onClose}
          >
            <XMarkIcon />
          </button>
        </div>
        <div className={styles.body}>
          <SettingsForm
            title={`${def.name} settings`}
            schema={def.settingsDef}
            values={values}
            ephemeral={ephemeral}
            onChange={handleChange}
            onSetEphemeral={setEphemeral}
          />
        </div>
      </div>
    </>
  );
}
