import { registerWidget, WidgetDefinition, WidgetSettingsDefinition, WidgetSettingsProps } from "../../registry/defRegistry";
import { WidgetPlacementProps } from "../widget";

export type AppletSettingsDefinition = WidgetSettingsDefinition;
export type AppletSettingsProps<T extends AppletSettingsDefinition> = WidgetSettingsProps<T>;
export type AppletDefinition = WidgetDefinition;


export function registerApplet<S extends AppletSettingsDefinition>(
  inner: React.ComponentType<WidgetSettingsProps<S>>,
  definition: Omit<AppletDefinition, "component"> & { settingsDef: S },
): React.FC<WidgetPlacementProps & WidgetSettingsProps<S>> {
  //@ts-expect-error this is the only place we want to add the "applet" tag, so we can ignore the type error here
  definition.tags.push("applet");
  return registerWidget<S>(inner, definition);
}