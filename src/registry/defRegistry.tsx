import { Suspense, ComponentType, useMemo } from "react";
import Widget, { WidgetPlacementProps } from "../widgets/widget";
import { DelayedLoading } from "../components/Loading";
import { logger } from "../utils/logger";
import {
  ResolvedWidgetSettingsEntry,
  WidgetSettingsDefinition,
  WidgetSettingsProps,
} from "./settingsSchema";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import WidgetError from "../components/WidgetError";
import { useWidgetApi } from "../runtime/context";
import { collectDefaults } from "./collectDefaults";


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

const { debug, warn } = logger("defRegistry");


export type ErasedWidgetProps = WidgetPlacementProps & {
  settings: Record<string, unknown>;
};

export interface WidgetDefinition<
  S extends WidgetSettingsDefinition = WidgetSettingsDefinition,
> {
  id: string;
  name: string;
  description: string;
  category: keyof typeof CATEGORIES;
  tags: (keyof Omit<typeof TAGS, "applet">)[];
  minSize: [number | null, number | null];
  maxSize: [number | null, number | null];
  settingsDef: S;
  /**
   * Author-supplied settings combinations the add-rail gallery steps through to
   * show off what the widget can look like. Each entry is layered over the
   * widget's defaults, so a preset only has to name the settings it changes.
   */
  presetsSettings?: Partial<WidgetSettingsProps<S>>[];
}

export interface DefinitionRegistryEntry {
  component: ComponentType<ErasedWidgetProps>;
  metadata: WidgetDefinition;
}

const widgetRegistry = new Map<string, DefinitionRegistryEntry>();

const MAX_GROUP_DEPTH = 3;

function checkGroupDepth(
  def: WidgetSettingsDefinition,
  widgetId: string,
  depth: number,
): void {
  for (const setting of Object.values(def)) {
    if (setting.type === "group") {
      if (depth > MAX_GROUP_DEPTH) {
        throw new Error(
          `Widget '${widgetId}': settings groups nested past MAX_GROUP_DEPTH (${MAX_GROUP_DEPTH})`,
        );
      }
      checkGroupDepth(setting.settings, widgetId, depth + 1);
    } else if (setting.type === "select") {
      const resolved = setting as ResolvedWidgetSettingsEntry<typeof setting>;
      for (const opt of Object.values(resolved.options)) {
        if (typeof opt === "object" && opt.settings) {
          checkGroupDepth(opt.settings, widgetId, depth);
        }
      }
    }
  }
}

function shallowEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  // Sound here without a deep compare because every value-bearing setting case
  // contributes a primitive -- SettingType is string/number/boolean, and a
  // select contributes one of its own option keys. Nothing in a settings object
  // is ever an array or a nested object.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Authoring check for gallery presets: the rail's stepper already shows the
 * widget's own defaults as its first preset, so a declared preset that resolves
 * to the defaults -- or to an earlier preset -- is a redundant dot showing an
 * identical widget.
 *
 * Warns rather than throwing, unlike checkGroupDepth: a duplicate preset is
 * cosmetic, and taking the app down over one would be wildly out of proportion
 * to a spare dot.
 */
function checkPresets(
  metadata: Pick<WidgetDefinition, "id" | "settingsDef" | "presetsSettings">,
): void {
  const declared = metadata.presetsSettings as
    | Record<string, unknown>[]
    | undefined;
  if (!declared?.length) return;

  // Compare resolved, not as-written: presets are partial, so two that name
  // different subsets can still land on the same settings once merged.
  const defaults = collectDefaults(metadata.settingsDef);
  const resolved = declared.map((preset) => ({ ...defaults, ...preset }));

  resolved.forEach((settings, i) => {
    if (shallowEqual(settings, defaults)) {
      warn(
        `Widget '${metadata.id}': presetsSettings[${i}] resolves to the widget's own defaults, which the gallery already shows as the first preset -- remove it.`,
      );
      return;
    }
    const twin = resolved.findIndex(
      (other, j) => j < i && shallowEqual(other, settings),
    );
    if (twin !== -1) {
      warn(
        `Widget '${metadata.id}': presetsSettings[${i}] resolves to the same settings as presetsSettings[${twin}] -- one of them is redundant.`,
      );
    }
  });
}

function hasUnsetRequired(
  def: WidgetSettingsDefinition,
  settings: Record<string, unknown>,
): boolean {
  return Object.entries(def).some(([key, setting]) => {
    if (setting.type === "group") {
      return hasUnsetRequired(setting.settings, settings);
    }
    if (
      "required" in setting &&
      setting.required &&
      settings[key] === undefined
    ) {
      return true;
    }
    if (setting.type === "select" && typeof setting.options === "object") {
      const chosen = setting.options[settings[key] as string];
      if (chosen && typeof chosen === "object" && chosen.settings) {
        return hasUnsetRequired(chosen.settings, settings);
      }
    }
    return false;
  });
}

export interface WidgetFallbacks<S extends WidgetSettingsDefinition> {
  // Loading component to show when widget is suspended
  loading?: ComponentType<WidgetSettingsProps<S>>;
  // Error component to show when widget throws an error
  error?: ComponentType<FallbackProps>;
  // Preinit component to show while widget has unset settings
  preinit?: ComponentType<Partial<WidgetSettingsProps<S>>>;
}

export function registerWidget<S extends WidgetSettingsDefinition>(
  Component: ComponentType<WidgetSettingsProps<S>>,
  // WidgetDefinition<S>, not the erased WidgetDefinition: presetsSettings is
  // only checked against the widget's own settings schema if S is threaded
  // through here.
  metadata: Omit<WidgetDefinition<S>, "settingsDef"> & { settingsDef: S },
  fallbacks?: WidgetFallbacks<S>,
): void {
  debug(`Registering widget: ${metadata.id}`);
  checkGroupDepth(metadata.settingsDef, metadata.id, 1);
  checkPresets(metadata);

  function DefaultLoading() {
    return <DelayedLoading what={metadata.name} delay={300} />;
  }

  function DefaultError({ error, resetErrorBoundary }: FallbackProps) {
    const { instanceId } = useWidgetApi();
    return (
      <WidgetError
        error={error}
        resetErrorBoundary={resetErrorBoundary}
        instanceId={instanceId}
        widgetDef={metadata}
      />
    );
  }

  function DefaultPreinit() {
    return <div>Widget {metadata.name} is not initialized</div>; // FIXME
  }

  type Erased = ComponentType<Record<string, unknown>>;
  const Inner = Component as Erased;
  const LoadingComponent = (fallbacks?.loading ?? DefaultLoading) as Erased;
  const PreinitComponent = (fallbacks?.preinit ?? DefaultPreinit) as Erased;
  const ErrorComponent = fallbacks?.error ?? DefaultError;

  function WidgetWrapper({
    col,
    row,
    colSpan,
    rowSpan,
    settings,
  }: ErasedWidgetProps) {
    const api = useWidgetApi();
    const hasUnset = useMemo(
      () => hasUnsetRequired(metadata.settingsDef, settings),
      [metadata.settingsDef, settings],
    );
    return (
      <Widget col={col} row={row} colSpan={colSpan} rowSpan={rowSpan}>
        <ErrorBoundary
          FallbackComponent={ErrorComponent}
          onReset={api.retryPersistence}
        >
          {hasUnset ? (
            <PreinitComponent {...settings} />
          ) : (
            <Suspense fallback={<LoadingComponent {...settings} />}>
              <Inner {...settings} />
            </Suspense>
          )}
        </ErrorBoundary>
      </Widget>
    );
  }
  WidgetWrapper.displayName = metadata.name + " Widget Wrapper";

  widgetRegistry.set(metadata.id, { component: WidgetWrapper, metadata });
}

export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return widgetRegistry.get(id)?.metadata;
}

export function getWidgetEntry(id: string): DefinitionRegistryEntry | undefined {
  return widgetRegistry.get(id);
}

export function getAllWidgetDefinitions() {
  return Array.from(widgetRegistry.values()).map((v) => v.metadata);
}
