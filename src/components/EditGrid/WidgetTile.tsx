import { Cog6ToothIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { getWidgetDefinition } from "../../registry/defRegistry";
import { InstanceRegistry } from "../../registry/instanceRegistry";
import { RenderWidget } from "../../widgets/widget";
import WidgetSettingsPanel from "../WidgetSettingsPanel";
import { gridItemStyle } from "./gridMath";
import { ResizeHandles } from "./ResizeHandles";
import styles from "./styles/grid.module.css";
import { ResizeDir } from "./types";

export function WidgetTile({
  instanceId,
  registry,
  isFlashing,
  errorClass,
  isSettingsOpen,
  onToggleSettings,
  onRemove,
  onDragStart,
  onResizeStart,
}: {
  instanceId: string;
  registry: InstanceRegistry;
  isFlashing: boolean;
  errorClass: string;
  isSettingsOpen: boolean;
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
      className={`${styles.widgetOverlay} ${isFlashing ? styles.widgetFlash : ""} ${errorClass}`}
      style={gridItemStyle(inst.placement)}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        e.preventDefault();
        onDragStart(e);
      }}
    >
      <div className={styles.widgetButtons} data-no-drag>
        {def?.settingsDef && Object.keys(def.settingsDef).length > 0 && (
          <button
            className={styles.iconButton}
            title="Widget settings"
            onClick={onToggleSettings}
          >
            <Cog6ToothIcon />
          </button>
        )}
        <button
          className={`${styles.iconButton} ${styles.danger}`}
          title="Remove widget"
          onClick={onRemove}
        >
          <XMarkIcon />
        </button>
      </div>
      <div className={styles.widgetPreview}>
        <RenderWidget instanceId={instanceId} registry={registry} />
      </div>
      {isSettingsOpen && (
        <WidgetSettingsPanel instanceId={instanceId} onClose={onToggleSettings} />
      )}
      <ResizeHandles onResizeStart={onResizeStart} />
    </div>
  );
}
