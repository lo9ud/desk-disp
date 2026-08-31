import type { ThemeData, ThemeInfo } from "../../ffi_types";
import type { Transport } from "../transport";

export interface ThemeCommands {
  list(): Promise<ThemeInfo[]>;
  get(id: string): Promise<ThemeData>;
  save(theme: ThemeData): Promise<void>;
  delete(id: string): Promise<void>;
  setActive(id: string | null): Promise<void>;
  preview(theme: ThemeData): Promise<void>;
  generate(seedHex: string): Promise<void>;
  openFolder(): Promise<void>;
  restoreDefaults(): Promise<void>;
}

export function makeThemeCommands(t: Transport): ThemeCommands {
  return {
    list: () => t.invoke<ThemeInfo[]>("list_themes"),
    get: (id) => t.invoke<ThemeData>("get_theme", { id }),
    save: (theme) => t.invoke<void>("save_theme", { theme }),
    delete: (id) => t.invoke<void>("delete_theme", { id }),
    setActive: (id) => t.invoke<void>("set_active_theme", { name: id }), // FIXME: name vs id mismatch in backend
    preview: (theme) => t.invoke<void>("preview_theme", { theme }),
    generate: (seedHex) => t.invoke<void>("generate_theme", { seedHex }),
    openFolder: () => t.invoke<void>("open_themes_folder"),
    restoreDefaults: () => t.invoke<void>("restore_defaults"),
  };
}
