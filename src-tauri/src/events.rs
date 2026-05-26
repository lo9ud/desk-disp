use tauri::{AppHandle, Emitter};

use crate::config::{Config, LayoutFile, Preferences, WidgetConfig, WidgetId};

pub const STREAM_SYSTEM: &str = "stream::system";
pub const STREAM_MEDIA: &str = "stream::media";
pub const STREAM_VISUALIZER: &str = "stream::visualizer";
pub const STREAM_HARDWARE: &str = "stream::hardware";
pub const CONFIG_CHANGED: &str = "config::changed";
pub const THEME_CHANGED: &str = "theme::changed";
pub const LAYOUT_CHANGED: &str = "layout::changed";
pub const WIDGET_UPDATED: &str = "widget::updated";
pub const PREFERENCES_CHANGED: &str = "preferences::changed";
pub const PREFERENCES_PREVIEW: &str = "preferences::preview";

#[derive(serde::Serialize, Clone)]
struct ThemeChangedPayload<'a> {
    id: &'a str,
    css: &'a str,
}

#[derive(serde::Serialize, Clone)]
struct LayoutChangedPayload<'a> {
    id: &'a str,
    layout: &'a LayoutFile,
}

#[derive(serde::Serialize, Clone)]
struct WidgetUpdatedPayload<'a> {
    id: WidgetId,
    config: &'a WidgetConfig,
}

pub fn emit_config_changed(app: &AppHandle, config: &Config) {
    tracing::trace!(target: "events", event = CONFIG_CHANGED, "emit");
    app.emit(CONFIG_CHANGED, config).ok();
}

pub fn emit_theme_changed(app: &AppHandle, id: &str, css: &str) {
    tracing::trace!(target: "events", event = THEME_CHANGED, theme = %id, "emit");
    app.emit(THEME_CHANGED, ThemeChangedPayload { id, css }).ok();
}

pub fn emit_layout_changed(app: &AppHandle, id: &str, layout: &LayoutFile) {
    tracing::trace!(target: "events", event = LAYOUT_CHANGED, layout = %id, "emit");
    app.emit(LAYOUT_CHANGED, LayoutChangedPayload { id, layout }).ok();
}

pub fn emit_widget_updated(app: &AppHandle, id: WidgetId, config: &WidgetConfig) {
    tracing::trace!(target: "events", event = WIDGET_UPDATED, widget_id = ?id, "emit");
    app.emit(WIDGET_UPDATED, WidgetUpdatedPayload { id, config }).ok();
}

pub fn emit_preferences_changed(app: &AppHandle, prefs: &Preferences) {
    tracing::trace!(target: "events", event = PREFERENCES_CHANGED, "emit");
    app.emit_to("main", PREFERENCES_CHANGED, prefs).ok();
}

pub fn emit_preferences_preview(app: &AppHandle, prefs: &Preferences) {
    tracing::trace!(target: "events", event = PREFERENCES_PREVIEW, "emit");
    app.emit_to("main", PREFERENCES_PREVIEW, prefs).ok();
}
