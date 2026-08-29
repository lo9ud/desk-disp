import type { LayoutFile, LayoutInfo, WidgetConfig } from "../../ffi_types";
import type { Transport } from "../transport";

export interface LayoutCommands {
  list(): Promise<LayoutInfo[]>;
  get(id: string): Promise<LayoutFile>;
  save(id: string, layout: LayoutFile): Promise<void>;
  delete(id: string): Promise<void>;
  /** Rename regenerates the id (delete + recreate); the new UUID is returned. */
  rename(oldId: string, newName: string): Promise<string>;
  setActive(id: string | null): Promise<void>;
  updateGrid(
    id: string,
    grid_rows: number,
    grid_cols: number,
    gap: number,
    padding: number,
  ): Promise<void>;
  openFolder(): Promise<void>;
  updateWidget(id: string, config: WidgetConfig): Promise<void>;
}

export function makeLayoutCommands(t: Transport): LayoutCommands {
  return {
    list: () => t.invoke<LayoutInfo[]>("list_layouts"),
    get: (id) => t.invoke<LayoutFile>("get_layout", { id }),
    save: (id, layout) => t.invoke<void>("save_layout", { id, layout }),
    delete: (id) => t.invoke<void>("delete_layout", { id }),
    rename: (oldId, newName) =>
      t.invoke<string>("rename_layout", { oldId, newName }),
    setActive: (id) => t.invoke<void>("set_active_layout", { id }),
    updateGrid: (id, grid_rows, grid_cols, gap, padding) =>
      t.invoke<void>("update_layout_grid", {
        id,
        grid_rows,
        grid_cols,
        gap,
        padding,
      }),
    openFolder: () => t.invoke<void>("open_layouts_folder"),
    updateWidget: (id, config) =>
      t.invoke<void>("update_widget", { widgetId: id, config }),
  };
}
