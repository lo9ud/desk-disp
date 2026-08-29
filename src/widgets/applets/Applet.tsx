import { registerWidget, WidgetDefinition, WidgetFallbacks, WidgetSettingsDefinition, WidgetSettingsProps } from "../../registry/defRegistry";

export type AppletSettingsDefinition = WidgetSettingsDefinition;
export type AppletSettingsProps<T extends AppletSettingsDefinition> = WidgetSettingsProps<T>;
export type AppletDefinition = WidgetDefinition;


export function registerApplet<S extends AppletSettingsDefinition>(
  inner: React.ComponentType<WidgetSettingsProps<S>>,
  definition: Omit<AppletDefinition, "component"> & { settingsDef: S },
  fallbacks?: WidgetFallbacks<S>,
): void {
  //@ts-expect-error this is the only place we want to add the "applet" tag, so we can ignore the type error here
  definition.tags.push("applet");
  registerWidget<S>(inner, definition, fallbacks);
}