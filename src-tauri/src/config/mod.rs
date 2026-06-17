use dirs::config_dir;

mod commands;
mod file;
mod widget;

pub use self::commands::*;
pub use self::file::*;
pub use self::widget::{WidgetConfig, WidgetId};
pub use self::commands::{get_or_create_settings_window};

use std::{
    fs,
    path::PathBuf,
};

pub const TARGET: &str = "config";

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
#[serde(default)]
pub struct Preferences {
    pub rounded: bool,
    pub widget_transparent: bool,
    pub background_transparent: bool,
    pub font_scale: f32,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            rounded: false,
            widget_transparent: false,
            background_transparent: false,
            font_scale: 1.0,
        }
    }
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
#[serde(default)]
pub struct Config {
    pub monitor: Option<String>,
    pub active_theme: Option<String>,
    pub active_layout: Option<String>,
    pub preferences: Preferences,
}

/* Theme types  */

/// A single typed CSS variable entry. The CSS variable name is assembled as
/// `--{type}-{label}` (e.g. Color { label: "base" } → `--color-base`).
#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ThemeVar {
    Color { label: String, value: String },
    Font  { label: String, value: Vec<String> },
}

impl ThemeVar {
    fn css_line(&self) -> String {
        match self {
            Self::Color { label, value } => format!("  --color-{label}: {value};"),
            Self::Font  { label, value } => format!("  --font-{label}: {};", value.join(", ")),
        }
    }
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct ThemeData {
    pub id: String,
    pub name: String,
    pub vars: Vec<ThemeVar>,
    pub color_scheme: String,
}

impl ThemeData {
    pub fn to_css(&self) -> String {
        let lines: Vec<String> = self.vars.iter().map(|v| v.css_line()).collect();
        format!(":root {{\n  color-scheme: {};\n{}\n}}", self.color_scheme, lines.join("\n"))
    }
}

/// Lightweight summary returned by `list_themes`.
#[derive(serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct ThemeInfo {
    pub id: String,
    pub name: String,
}

/* Layout types  */

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct LayoutFile {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub grid: GridSettings,
    pub widgets: Vec<widget::WidgetConfig>,
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct GridPadding {
    pub top: u32,
    pub right: u32,
    pub bottom: u32,
    pub left: u32,
}

impl Default for GridPadding {
    fn default() -> Self {
        Self { top: 24, right: 24, bottom: 24, left: 24 }
    }
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct GridSettings {
    pub grid_rows: u32,
    pub grid_cols: u32,
    pub gap: u32,
    #[serde(default)]
    pub padding: GridPadding,
}

/// Lightweight summary returned by `list_layouts`.
#[derive(serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct LayoutInfo {
    pub id: String,
    pub name: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            monitor: None,
            active_theme: Some("e58e167b-8c7d-4b88-9c20-46b25147ab25".to_string()),
            active_layout: Some("3dd07989-2eda-4a0b-83f8-ef66323e85a4".to_string()),
            preferences: Preferences::default(),
        }
    }
}

impl Config {
    pub fn set_active_theme(&mut self, id: Option<String>, app: &tauri::AppHandle) -> Result<(), String> {
        tracing::debug!(target: TARGET, theme = ?id, "set_active_theme");
        self.active_theme = id;
        write_config(self).map_err(|e| {
            tracing::error!(target: TARGET, error = %e, "failed to write config");
            e.to_string()
        })?;
        tracing::trace!(target: TARGET, "emitting config::changed");
        crate::events::emit_config_changed(app, self);
        if let Some(ref theme_id) = self.active_theme {
            match load_theme_css(theme_id) {
                Ok(css) => {
                    tracing::trace!(target: TARGET, theme = %theme_id, "emitting theme::changed");
                    crate::events::emit_theme_changed(app, theme_id, &css);
                }
                Err(e) => tracing::warn!(target: TARGET, error = %e, "failed to load theme after set"),
            }
        }
        Ok(())
    }

    pub fn set_active_layout(&mut self, id: Option<String>, app: &tauri::AppHandle) -> Result<(), String> {
        tracing::debug!(target: TARGET, layout = ?id, "set_active_layout");
        self.active_layout = id;
        write_config(self).map_err(|e| {
            tracing::error!(target: TARGET, error = %e, "failed to write config");
            e.to_string()
        })?;
        tracing::trace!(target: TARGET, "emitting config::changed");
        crate::events::emit_config_changed(app, self);
        if let Some(ref layout_id) = self.active_layout {
            match layout_path(layout_id)
                .and_then(|path| fs::read_to_string(path).map_err(|e| e.to_string()))
                .and_then(|content| serde_json::from_str::<LayoutFile>(&content).map_err(|e| e.to_string()))
            {
                Ok(layout) => {
                    tracing::trace!(target: TARGET, layout = %layout_id, "emitting layout::changed");
                    crate::events::emit_layout_changed(app, layout_id, &layout);
                }
                Err(e) => tracing::warn!(target: TARGET, error = %e, "failed to load layout after set"),
            }
        }
        Ok(())
    }

    pub fn set_monitor(&mut self, monitor: Option<tauri::Monitor>, app: &tauri::AppHandle) -> Result<(), String> {
        tracing::debug!(target: TARGET, monitor = ?monitor, "set_monitor");
        self.monitor = monitor.and_then(|m| m.name().map(|n| n.to_string()));
        write_config(self).map_err(|e| {
            tracing::error!(target: TARGET, error = %e, "failed to write config");
            e.to_string()
        })?;
        tracing::trace!(target: TARGET, "emitting config::changed");
        crate::events::emit_config_changed(app, self);
        Ok(())
    }
}

/* Path helpers  */

fn app_config_dir() -> Option<PathBuf> {
    config_dir().map(|mut p| {
        p.push("desk-disp");
        p
    })
}

pub fn get_config_path() -> Option<PathBuf> {
    app_config_dir().map(|mut p| {
        p.push("config.json");
        p
    })
}

pub fn get_themes_root() -> Option<PathBuf> {
    app_config_dir().map(|mut p| {
        p.push("themes");
        p
    })
}

pub fn get_layouts_root() -> Option<PathBuf> {
    app_config_dir().map(|mut p| {
        p.push("layouts");
        p
    })
}

pub(super) fn theme_path(id: &str) -> Result<PathBuf, String> {
    let root = get_themes_root().ok_or("cannot determine themes directory")?;
    Ok(root.join(format!("{}.json", id)))
}

pub(super) fn layout_path(id: &str) -> Result<PathBuf, String> {
    let root = get_layouts_root().ok_or("cannot determine layouts directory")?;
    Ok(root.join(format!("{}.json", id)))
}

pub(super) fn load_theme_css(id: &str) -> Result<String, String> {
    let path = theme_path(id)?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: ThemeData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data.to_css())
}

/* Default themes  */

const DEFAULT_THEMES: &[(&str, &str)] = &[
    ("e58e167b-8c7d-4b88-9c20-46b25147ab25", include_str!("../../themes/dark.json")),
    ("3227d82e-90a3-421e-8a36-29b43d5ab18c", include_str!("../../themes/light.json")),
    ("6dcea86b-f7fe-48b4-8e61-9c35c381000a", include_str!("../../themes/solarized-dark.json")),
    ("11011b97-03a0-4d66-a842-115d5d2fdd05", include_str!("../../themes/solarized-light.json")),
    ("4d6cef34-219c-4b4a-8005-989ad37e70d3", include_str!("../../themes/catppuccin-mocha.json")),
    ("eb57973a-f744-4617-bfbc-41e01c67d9a9", include_str!("../../themes/nord.json")),
    ("29b963d4-15f2-4436-974f-535e273b75a3", include_str!("../../themes/dracula.json")),
    ("2310da9d-6cc3-4891-88a9-1322784d6293", include_str!("../../themes/rose-pine.json")),
    ("b1e3eaa5-d37a-4dc4-90b4-ba7a4fbcacf2", include_str!("../../themes/gruvbox-dark.json")),
];

pub fn ensure_default_themes() {
    let root = match get_themes_root() {
        Some(d) => d,
        None => return,
    };
    if let Err(e) = fs::create_dir_all(&root) {
        tracing::warn!(target: TARGET, error = %e, "failed to create themes dir");
        return;
    }
    for (id, json) in DEFAULT_THEMES {
        let path = root.join(format!("{}.json", id));
        #[cfg(not(debug_assertions))]
        if !path.exists() {
            if let Err(e) = fs::write(&path, json) {
                tracing::warn!(target: TARGET, id, error = %e, "failed to write default theme");
            }
        }
        #[cfg(debug_assertions)]
        {
            if let Err(e) = fs::write(&path, json) {
                tracing::warn!(target: TARGET, id, error = %e, "failed to write default theme");
            }
        }
    }
    tracing::debug!(target: TARGET, path = %root.display(), "default themes ensured");
}

/* Default layouts  */

const DEFAULT_LAYOUTS: &[(&str, &str)] = &[
    ("3dd07989-2eda-4a0b-83f8-ef66323e85a4", include_str!("../../layouts/default.json")),
    ("6e76b291-efd3-4b14-a92c-65da440f3045", include_str!("../../layouts/minimal-media.json")),
    ("269f80e2-7517-4a65-a6b7-27551b06e4a8", include_str!("../../layouts/media-highlight.json")),
];

pub fn ensure_default_layouts() {
    let root = match get_layouts_root() {
        Some(d) => d,
        None => return,
    };
    if let Err(e) = fs::create_dir_all(&root) {
        tracing::warn!(target: TARGET, error = %e, "failed to create layouts dir");
        return;
    }
    for (id, json) in DEFAULT_LAYOUTS {
        let path = root.join(format!("{}.json", id));
        #[cfg(not(debug_assertions))]
        if !path.exists() {
            if let Err(e) = fs::write(&path, json) {
                tracing::warn!(target: TARGET, id, error = %e, "failed to write default layout");
            }
        }
        #[cfg(debug_assertions)]
        {
            if let Err(e) = fs::write(&path, json) {
                tracing::warn!(target: TARGET, id, error = %e, "failed to write default layout");
            }
        }
    }
    tracing::debug!(target: TARGET, path = %root.display(), "default layouts ensured");
}

pub struct MonitorCache {
    index: usize,
    monitors: Vec<tauri::Monitor>,
}

/// Build a monitor cache seeded to the monitor with `current_name` so that the
/// first `next()` call advances past whichever monitor the window is already on.
pub fn build_monitor_cache(win: &tauri::WebviewWindow, current_name: Option<&str>) -> MonitorCache {
    let monitors = win.available_monitors().unwrap_or_default();
    let index = current_name
        .and_then(|name| monitors.iter().position(|m| m.name().map_or(false, |n| n == name)))
        .unwrap_or(0);
    MonitorCache { index, monitors }
}

impl MonitorCache {
    pub fn len(&self) -> usize {
        self.monitors.len()
    }

    pub fn get(&self) -> Option<&tauri::Monitor> {
        self.monitors.get(self.index)
    }

    pub fn next(&mut self) -> Option<&tauri::Monitor> {
        if self.monitors.is_empty() {
            return None;
        }
        self.index = (self.index + 1) % self.monitors.len();
        self.get()
    }
}