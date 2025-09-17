export type MediaInfoWidget = WidgetProps<"media-info", {
    get_high_res: boolean;
    blur: boolean;
}>;
export type WeatherWidget = WidgetProps<"weather", { lat: number; lon: number }>;
export type PerfGraphWidget = WidgetProps<"perf-graph", { stat: string }>;
export type DiskUsageWidget = WidgetProps<"disk-usage", {}>;
export type VisualizerWidget = WidgetProps<"visualizer", {}>;
export type NetworkWidget = WidgetProps<"network", {}>;
export type TimeDateWidget = WidgetProps<"time-date", { lat: number; lon: number }>;

type WidgetProps<T, P> = {
    position: { col: number; row: number };
    size: { cols: number; rows: number };
} & (T extends "" ? {} : { type: T, options?: P });

export type Widget = (
    | MediaInfoWidget
    | WeatherWidget
    | PerfGraphWidget
    | DiskUsageWidget
    | VisualizerWidget
    | NetworkWidget
    | TimeDateWidget
);