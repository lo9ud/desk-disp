import { Cog6ToothIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { getWidgetDefinition } from "../../registry/defRegistry";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { RenderWidget } from "../../widgets/widget";
import { gridItemStyle } from "./gridMath";
import { ResizeHandles } from "./ResizeHandles";
import styles from "./styles/grid.module.css";
import { ResizeDir } from "./types";

export function WidgetTile({
  instanceId,
  registry,
  isSelected,
  isFlashing,
  errorClass,
  isDimmed,
  tileRef,
  onToggleSettings,
  onRemove,
  onDragStart,
  onResizeStart,
}: {
  instanceId: string;
  registry: InstanceRegistry;
  isSelected: boolean;
  isFlashing: boolean;
  errorClass: string;
  /** Another widget's settings are open; recede so the edited one stands out
   *  and covering this tile with the panel reads as intentional. */
  isDimmed: boolean;
  /** Reports the tile element, used to anchor the settings panel. */
  tileRef?: (el: HTMLElement | null) => void;
  onToggleSettings: () => void;
  onRemove: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent, dir: ResizeDir) => void;
}) {
  const inst = registry.get(instanceId);
  if (!inst) return null;
  const def = getWidgetDefinition(inst.definitionId);

  return (
    <div
      ref={tileRef}
      className={`${styles.widgetOverlay} ${isSelected ? styles.widgetSelected : ""} ${isDimmed ? styles.widgetDimmed : ""} ${isFlashing ? styles.widgetFlash : ""} ${errorClass}`}
      style={gridItemStyle(inst.placement)}
      data-widget-id={instanceId}
      data-onboarding="widget-tile"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        e.preventDefault();
        onDragStart(e);
      }}
    >
      <div className={styles.widgetButtons} data-no-drag>
        {def?.settingsDef && Object.keys(def.settingsDef).length > 0 && (
          <button
            type="button"
            className={styles.iconButton}
            title="Widget settings"
            data-onboarding="widget-settings"
            onClick={onToggleSettings}
          >
            <Cog6ToothIcon />
          </button>
        )}
        <button
          type="button"
          className={`${styles.iconButton} ${styles.danger}`}
          title="Remove widget"
          data-onboarding="widget-remove"
          onClick={onRemove}
        >
          <XMarkIcon />
        </button>
      </div>
      <div className={styles.widgetPreview}>
        <RenderWidget instanceId={instanceId} registry={registry} />
      </div>
      {isSelected && <ResizeHandles onResizeStart={onResizeStart} />}
    </div>
  );
}
