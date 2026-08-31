import { getWidgetDefinition } from "./defRegistry";
import { collectDefaults } from "./collectDefaults";

// Re-exported so this stays the one place to look for "settings defaults",
// even though the registry-free half had to move out to break a cycle with
// defRegistry -- see collectDefaults.ts.
export { collectDefaults };

/** Full recursive default settings for a widget type, by definition id. */
export function defaultSettingsForWidget(
  defId: string,
): Record<string, unknown> {
  const def = getWidgetDefinition(defId);
  if (!def?.settingsDef) return {};
  return collectDefaults(def.settingsDef);
}

/**
 * One of a widget's gallery presets, by definition id and index into the
 * definition's own declared list.
 *
 * Note that is NOT the same index space as the rail stepper's `presetIndex`,
 * where 0 is the widget's defaults and the declared list starts at 1. Presets
 * are partial by design, to ease authoring.
 */
export function presetSettingsForWidget(
  defId: string,
  declaredIndex: number,
): Record<string, unknown> | undefined {
  const def = getWidgetDefinition(defId);
  return def?.presetsSettings?.[declaredIndex] as
    | Record<string, unknown>
    | undefined;
}
