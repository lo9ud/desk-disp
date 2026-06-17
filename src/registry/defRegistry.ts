import React from "react";
import Widget, { WidgetPlacementProps } from "../widgets/widget";
import { logger } from "../utils/logger";

export const TAGS = {
  interactive: "#b84d8c",
  customizable: "#4db88c",
  "requires setup": "#c97f5f",
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
  tags: (keyof typeof TAGS)[];
  minSize: [number | null, number | null];
  maxSize: [number | null, number | null];
  settingsDef: WidgetSettingsDefinition;
}

export interface WidgetSettingsDefinition {
  [settingKey: string]: WidgetSetting<any>;
}

export type SettingType = {
  string: string;
  number: number;
  boolean: boolean;
  select: string;
};
export const SettingType: SettingType = {
  string: "",
  number: 0,
  boolean: false,
  select: "",
};

export type SettingCondition =
  | {
      key: string;
      is: boolean | string | number | (boolean | string | number)[];
    }
  | { when: (settings: Record<string, unknown>) => boolean };

export type SelectOptionDef = {
  label: string;
  settings?: WidgetSettingsDefinition;
};

export type WidgetSetting<T extends keyof SettingType> = {
  label: string;
  showWhen?: SettingCondition;
  enableWhen?: SettingCondition;
  default?: SettingType[T];
} & (
  | { type: T extends "string" ? "string" : never }
  | ({
      type: T extends "number" ? "number" : never;
      unit?: string;
    } & (
      | {
          min: number;
          max: number;
          step: number;
        }
      | {
          steps: number[];
        }
    ))
  | { type: T extends "boolean" ? "boolean" : never }
  | {
      type: T extends "select" ? "select" : never;
      options: Record<string, string | SelectOptionDef>;
    }
);

type ExtractSettingValue<S> = S extends { type: "select"; options: infer O }
  ? keyof O
  : S extends { type: "number" }
    ? number
    : S extends { type: "boolean" }
      ? boolean
      : S extends { type: "string" }
        ? string
        : never;

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

type SubordinateSettingProps<S extends WidgetSettingsDefinition> = {
  [K in keyof S as S[K] extends { default: any } ? K : never]: ExtractSettingValue<S[K]>;
} & {
  [K in keyof S as S[K] extends { default: any } ? never : K]: ExtractSettingValue<S[K]> | undefined;
};

type OptionSubordinateProps<
  O extends Record<string, string | SelectOptionDef>,
> = UnionToIntersection<
  {
    [K in keyof O]: O[K] extends {
      settings: infer S extends WidgetSettingsDefinition;
    }
      ? SubordinateSettingProps<S>
      : {};
  }[keyof O]
>;

type FlattenDef<TDef extends WidgetSettingsDefinition> = {
  [K in keyof TDef as TDef[K] extends { default: any } ? K : never]: ExtractSettingValue<TDef[K]>;
} & {
  [K in keyof TDef as TDef[K] extends { default: any } ? never : K]: ExtractSettingValue<TDef[K]> | undefined;
} & UnionToIntersection<
  {
    [K in keyof TDef]: TDef[K] extends {
      type: "select";
      options: infer O extends Record<string, string | SelectOptionDef>;
    }
      ? OptionSubordinateProps<O>
      : {};
  }[keyof TDef]
>;

export type WidgetSettingsProps<T extends WidgetSettingsDefinition> =
  FlattenDef<T>;

const widgetRegistry = new Map<string, WidgetDefinition>();

export function registerWidget<S extends WidgetSettingsDefinition>(
  inner: React.ComponentType<WidgetSettingsProps<S>>,
  definition: Omit<WidgetDefinition, "component"> & { settingsDef: S },
): React.FC<WidgetPlacementProps & WidgetSettingsProps<S>> {
  debug(`Registering widget: ${definition.id}`);

  function WidgetWrapper(
    props: WidgetPlacementProps & WidgetSettingsProps<S>,
  ): React.ReactElement | null {
    const { col, row, colSpan, rowSpan, ...settings } =
      props as WidgetPlacementProps & Record<string, unknown>;
    return React.createElement(
      Widget,
      { col, row, colSpan, rowSpan },
      React.createElement(
        inner as React.ComponentType<Record<string, unknown>>,
        settings,
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