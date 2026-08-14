import React from "react";
import Widget, { WidgetPlacementProps } from "../widgets/widget";
import { DelayedLoading } from "../components/Loading";
import { logger } from "../utils/logger";
import type {
  ResolvedWidgetSettingsEntry,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "./settingsSchema";

// Re-exported explicitly (not `export *`) so a forgotten name fails loudly at
// the one import site that needs it (e.g. AddWidgetModal.tsx's direct
// SelectOptionDef import) instead of silently resolving to `any`. Split in
// two: the three below aren't referenced locally in this file, so they're
// pure re-exports; ResolvedWidgetSettingsEntry/WidgetSettingsDefinition/
// WidgetSettingsProps are also used locally (registerWidget's own
// MAX_GROUP_DEPTH check, WidgetDefinition, WidgetFallbacks), so those stay as
// a regular import above plus a re-export here.
export type {
  LocalValues,
  SchemaError,
  SelectOptionDef,
  SelectOptionsSource,
  SettingCondition,
  SettingType,
  VerifyStatus,
} from "./settingsSchema";
export type {
  ResolvedWidgetSettingsEntry,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
};

export const TAGS = {
  interactive: "#b84d8c",
  customizable: "#4db88c",
  "requires setup": "#c97f5f",
  applet: "#4d8cb8",
} as const;

export const CATEGORIES = {
  general: "General",
  time: "Time & Date",
  weather: "Weather",
  system: "System Info",
  productivity: "Productivity",
  aesthetic: "Aesthetic",
  media: "Media",
} as const;

const { debug } = logger("defRegistry");

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  component: React.ComponentType<any>;
  category: keyof typeof CATEGORIES;
  tags: (keyof Omit<typeof TAGS, "applet">)[];
  minSize: [number | null, number | null];
  maxSize: [number | null, number | null];
  settingsDef: WidgetSettingsDefinition;
}

const widgetRegistry = new Map<string, WidgetDefinition>();

// Someone nesting `group` cases absurdly deep is a UX/authoring concern (a
// settings panel too many <strong> headings deep is unusable), not a
// type-soundness one -- WidgetSettingsCaseMap's group.settings is unbounded
// self-reference on purpose (see settingsSchema.ts). Guarded here at
// registration time instead of at the type level; loosen by bumping this
// constant if a legitimate widget ever needs more.
const MAX_GROUP_DEPTH = 3;

// Cheap recursive walk over a settingsDef, tracking how many `group`s deep
// the current position is. Also descends into select options' subordinate
// settings (groups can appear there too) without incrementing depth itself
// -- a select layer isn't a group layer, only nested groups count.
function checkGroupDepth(
  def: WidgetSettingsDefinition,
  widgetId: string,
  depth: number,
): void {
  for (const setting of Object.values(def)) {
    if (setting.type === "group") {
      if (depth >= MAX_GROUP_DEPTH) {
        throw new Error(
          `Widget '${widgetId}': settings groups nested past MAX_GROUP_DEPTH (${MAX_GROUP_DEPTH})`,
        );
      }
      checkGroupDepth(setting.settings, widgetId, depth + 1);
    } else if (setting.type === "select") {
      // options is optional on the authoring type, but a select entry
      // reachable from a widget's own settingsDef at registerWidget time
      // already has it -- a genuine omission would have collapsed that
      // widget's WidgetSettingsProps to a SchemaError and failed to compile
      // before this ever ran.
      const resolved = setting as ResolvedWidgetSettingsEntry<typeof setting>;
      for (const opt of Object.values(resolved.options)) {
        if (typeof opt === "object" && opt.settings) {
          checkGroupDepth(opt.settings, widgetId, depth);
        }
      }
    }
  }
}

// What to render in exceptional states, distinct from both the widget's own
// component and its catalog metadata - extensible later (e.g. a custom error
// component) without touching either of those.
export interface WidgetFallbacks<S extends WidgetSettingsDefinition> {
  // Shown in place of the widget while its persisted data is first loading
  // (see src/ipc/persistence.ts). Defaults to a generic spinner naming the
  // widget if not provided.
  loading?: React.ComponentType<WidgetSettingsProps<S>>;
}

export function registerWidget<S extends WidgetSettingsDefinition>(
  inner: React.ComponentType<WidgetSettingsProps<S>>,
  definition: Omit<WidgetDefinition, "component"> & { settingsDef: S },
  fallbacks?: WidgetFallbacks<S>,
): React.FC<WidgetPlacementProps & WidgetSettingsProps<S>> {
  debug(`Registering widget: ${definition.id}`);
  checkGroupDepth(definition.settingsDef, definition.id, 1);

  function DefaultLoading(_settings: Record<string, unknown>) {
    return React.createElement(DelayedLoading, { what: definition.name, delay: 300 });
  }
  const LoadingComponent = fallbacks?.loading ?? DefaultLoading;

  function WidgetWrapper(
    props: WidgetPlacementProps & WidgetSettingsProps<S>,
  ): React.ReactElement | null {
    const { col, row, colSpan, rowSpan, ...settings } =
      props as WidgetPlacementProps & Record<string, unknown>;
    return React.createElement(
      Widget,
      { col, row, colSpan, rowSpan },
      React.createElement(
        React.Suspense,
        {
          fallback: React.createElement(
            LoadingComponent as React.ComponentType<Record<string, unknown>>,
            settings,
          ),
        },
        React.createElement(
          inner as React.ComponentType<Record<string, unknown>>,
          settings,
        ),
      ),
    );
  }
  WidgetWrapper.displayName = definition.name;

  widgetRegistry.set(definition.id, {
    ...definition,
    component: WidgetWrapper as React.ComponentType<any>,
  });

  return WidgetWrapper;
}

export function getWidgetDefinition(id: string) {
  return widgetRegistry.get(id);
}

export function getAllWidgetDefinitions() {
  return Array.from(widgetRegistry.values());
}
