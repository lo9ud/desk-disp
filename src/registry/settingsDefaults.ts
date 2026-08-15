import {
  getWidgetDefinition,
  ResolvedWidgetSettingsEntry,
  SelectOptionsSource,
  WidgetSettingsDefinition,
} from "./defRegistry";

// Defaults contributed by a select's subordinate options -- pulled out of
// collectDefaults so that function stays flat (one thing per case) rather
// than nesting a second loop inside it. A dynamic (function-valued) options
// source has nothing to contribute here: its actual option set, and
// whatever per-option subordinate settings it might carry, aren't knowable
// until runtime -- same reasoning FlattenDef's own select branch already
// applies at the type level (see settingsSchema.ts).
function collectSelectSubordinateDefaults(
  options: SelectOptionsSource,
): Record<string, unknown> {
  if (typeof options === "function") return {};
  const defaults: Record<string, unknown> = {};
  for (const opt of Object.values(options)) {
    if (typeof opt === "object" && opt.settings) {
      Object.assign(defaults, collectDefaults(opt.settings));
    }
  }
  return defaults;
}

export function collectDefaults(
  def: WidgetSettingsDefinition,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, setting] of Object.entries(def)) {
    // group/trigger/marker/indicator aren't value-bearing (no default/required
    // at all) -- a group's own settings still need collecting recursively,
    // same as a select's subordinate settings below; the other three store
    // nothing and are skipped entirely.
    if (setting.type === "group") {
      Object.assign(defaults, collectDefaults(setting.settings));
      continue;
    }
    if (
      setting.type === "trigger" ||
      setting.type === "marker" ||
      setting.type === "indicator"
    ) {
      continue;
    }
    if (!setting.required) {
      defaults[key] = setting.default;
    }
    if (setting.type === "select") {
      // `options` is optional on the authoring-facing WidgetSettingsEntry
      // (so a missing one becomes a SchemaError instead of a rejected
      // literal) but this settingsDef came from an already-registered
      // widget -- a genuinely missing `options` would have failed to
      // compile at that widget's own registerWidget call, so it's safe to
      // resolve it back to required here.
      const resolved = setting as ResolvedWidgetSettingsEntry<typeof setting>;
      Object.assign(
        defaults,
        collectSelectSubordinateDefaults(resolved.options),
      );
    }
  }
  return defaults;
}

/** Full recursive default settings for a widget type, by definition id. */
export function defaultSettingsForWidget(
  defId: string,
): Record<string, unknown> {
  const def = getWidgetDefinition(defId);
  if (!def?.settingsDef) return {};
  return collectDefaults(def.settingsDef);
}
