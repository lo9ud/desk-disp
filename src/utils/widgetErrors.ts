import { getWidgetDefinition } from "../registry/defRegistry";
import { canonicalRegistry } from "../registry/instanceRegistry";

export type OutOfBoundsError = {
  kind: "out_of_bounds";
  widgetIds: [string];
  axis: "col" | "row" | "both";
};

export type OverlapError = {
  kind: "overlap";
  widgetIds: [string, string, ...string[]];
};

export type ConfigError = {
  kind: "config";
  widgetIds: [string];
  settingKey: string;
};

export type TooSmallError = {
  kind: "too_small";
  widgetIds: [string];
  axis: "width" | "height" | "both";
  minSize: [number, number];
  actualSize: [number, number];
};

export type WidgetError =
  | OutOfBoundsError
  | OverlapError
  | ConfigError
  | TooSmallError;

export function errorSeverity(e: WidgetError): "error" | "warning" | "info" {
  switch (e.kind) {
    case "out_of_bounds":
    case "overlap":
    case "config":
      return "error";
    case "too_small":
      return "warning";
  }
}

export function widgetErrorText(e: WidgetError): {
  message: string;
  hint?: string;
} {
  switch (e.kind) {
    case "out_of_bounds": {
      const where =
        e.axis === "col"
          ? "right edge"
          : e.axis === "row"
            ? "bottom edge"
            : "right and bottom edges";
      return {
        message: `Widget extends past the ${where} of the grid`,
        hint: "Resize the widget or add more grid rows/columns",
      };
    }
    case "overlap": {
      const widgetNames = e.widgetIds.map((id) => {
        const def = canonicalRegistry.get(id)?.definitionId;
        if (!def) return id;
        return (
          getWidgetDefinition(def)?.name ||
          getWidgetDefinition(def)?.id ||
          id.slice(0, 5)
        );
      });
      return {
        message: `${widgetNames.slice(0, -1).join(", ")} & ${widgetNames[widgetNames.length - 1]} widgets overlap`,
        hint: "Move or resize the highlighted widgets so they don't overlap",
      };
    }
    case "config":
      return {
        message: `Invalid value for setting "${e.settingKey}"`,
        hint: "Open widget settings to correct this",
      };
    case "too_small": {
      const [aw, ah] = e.actualSize;
      const [mw, mh] = e.minSize;
      const message =
        e.axis === "width"
          ? `Widget is too narrow (${aw}px, needs ${mw}px)`
          : e.axis === "height"
            ? `Widget is too short (${ah}px, needs ${mh}px)`
            : `Widget is too small (${aw}×${ah}px, needs ${mw}×${mh}px)`;
      return {
        message,
        hint: "Make the widget span more grid cells",
      };
    }
  }
}
