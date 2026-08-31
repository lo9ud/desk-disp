use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use ts_rs::TS;

use crate::config::{Config, LayoutFile, Preferences, WidgetConfig, WidgetId};

pub const STREAM_MEDIA: &str = "stream::media";
pub const STREAM_VISUALIZER: &str = "stream::visualizer";
pub const CONFIG_CHANGED: &str = "config::changed";
pub const THEME_CHANGED: &str = "theme::changed";
pub const LAYOUT_CHANGED: &str = "layout::changed";
pub const WIDGET_UPDATED: &str = "widget::updated";
pub const PREFERENCES_CHANGED: &str = "preferences::changed";
pub const PREFERENCES_PREVIEW: &str = "preferences::preview";

#[derive(Serialize, Deserialize, TS, Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub enum StreamName {
    Cpu,
    Memory,
    Disks,
    Networks,
    Media,
    Visualizer,
}

impl StreamName {
    pub const fn as_str(self) -> &'static str {
        match self {
            StreamName::Cpu => "cpu",
            StreamName::Memory => "memory",
            StreamName::Disks => "disks",
            StreamName::Networks => "networks",
            StreamName::Media => "media",
            StreamName::Visualizer => "visualizer",
        }
    }

    /// The emitted Tauri event name, e.g. `"stream::cpu"`.
    pub fn event_name(self) -> String {
        format!("stream::{}", self.as_str())
    }
}

impl std::fmt::Display for StreamName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Default)]
pub struct StreamHints(Mutex<HashMap<StreamName, HashSet<String>>>);

impl StreamHints {
    pub fn new() -> Self {
        Self::default()
    }

    fn map(&self) -> std::sync::MutexGuard<'_, HashMap<StreamName, HashSet<String>>> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn start(&self, name: StreamName, window: &str) {
        self.map().entry(name).or_default().insert(window.to_string());
    }

    pub fn stop(&self, name: StreamName, window: &str) {
        if let Some(set) = self.map().get_mut(&name) {
            set.remove(window);
        }
    }

    pub fn clear_window(&self, window: &str) {
        for set in self.map().values_mut() {
            set.remove(window);
        }
    }

    pub fn is_active(&self, name: StreamName) -> bool {
        self.map().get(&name).is_some_and(|s| !s.is_empty())
    }

    pub fn window_count(&self, name: StreamName) -> usize {
        self.map().get(&name).map_or(0, HashSet::len)
    }
}

/// Tracks whether a stream is currently wanted and logs the pause/resume transition exactly
/// once when that state flips.
pub struct StreamGate {
    hints: Arc<StreamHints>,
    name: StreamName,
    had_subs: bool,
}

impl StreamGate {
    pub fn new(hints: Arc<StreamHints>, name: StreamName) -> Self {
        Self {
            hints,
            name,
            had_subs: false,
        }
    }

    /// Reads the current hint state, logs a transition if the gate flipped since the last
    /// call, and returns whether the caller should do work this tick.
    pub fn should_run(&mut self) -> bool {
        if !self.hints.is_active(self.name) {
            if self.had_subs {
                tracing::info!(target: "resource", stream = %self.name, "no subscribers - pausing updates");
                self.had_subs = false;
            }
            return false;
        }
        if !self.had_subs {
            let windows = self.hints.window_count(self.name);
            tracing::info!(target: "resource", stream = %self.name, windows, "subscriber(s) active - resuming updates");
            self.had_subs = true;
        }
        true
    }
}


pub fn emit_stream<T: Serialize + Clone>(app: &AppHandle, name: StreamName, payload: T) {
    if let Ok(value) = serde_json::to_value(&payload) {
        app.state::<crate::ChannelCache>().set(name, value);
    } else {
        tracing::error!(target: "events", stream = %name, "failed to serialize payload for cache");
    }
    let _ = app.emit(&name.event_name(), payload);
}

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

