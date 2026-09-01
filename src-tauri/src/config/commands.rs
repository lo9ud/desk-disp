use std::fs;

use tauri::{Manager, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::place_window;

use super::{
    get_layouts_root, layout_path, ChapterProgress, GridPadding, GridSettings, LayoutFile,
    LayoutInfo, Preferences, TARGET,
};

#[tauri::command]
pub async fn next_monitor(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let state = app.state::<crate::AppState>();
    let mut state = state.lock().await;
    // Clone the monitor first so the borrow of monitor_cache ends before we mutably borrow config.
    let next = state
        .monitor_cache
        .next()
        .ok_or("No monitors found")?
        .clone();
    state
        .config
        .set_monitor(Some(next.clone()), &app)
        .map_err(|e| e.to_string())?;
    place_window(&window, next);
    Ok(())
}

#[tauri::command]
pub async fn get_monitor_count(app: tauri::AppHandle) -> Result<usize, String> {
    let state = app.state::<crate::AppState>();
    let state = state.lock().await;
    Ok(state.monitor_cache.len())
}

pub fn get_or_create_settings_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(win) = app.get_webview_window("settings") {
        return Ok(win);
    }

    tracing::info!(target: TARGET, "creating settings window");
    let args = app.state::<crate::cli::Args>();
    let win = crate::prepare_webview(
        WebviewWindowBuilder::new(app, "settings", tauri::WebviewUrl::App("".into()))
            .title("desk-disp - Settings")
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .visible(false),
        &args,
    )
    .build()
    .map_err(|e| format!("{:?}", e))?;

    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });

    Ok(win)
}

#[tauri::command]
pub async fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    tracing::info!(target: TARGET, "open_settings");
    let win = get_or_create_settings_window(&app)?;
    let _ = win.set_focus();
    win.show().map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub async fn close_settings(app: tauri::AppHandle) -> Result<(), String> {
    tracing::info!(target: TARGET, "close_settings");
    let win = get_or_create_settings_window(&app)?;
    win.hide().map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub async fn toggle_settings_visibility(app: tauri::AppHandle) -> Result<(), String> {
    tracing::info!(target: TARGET, "toggle_settings_visibility");
    let win = get_or_create_settings_window(&app)?;
    win.is_visible()
        .map_err(|e| format!("{:?}", e))
        .and_then(|visible| {
            if visible {
                win.hide().map_err(|e| format!("{:?}", e))
            } else {
                win.show().map_err(|e| format!("{:?}", e))
            }
        })
}

/* Layout commands  */

#[tauri::command]
pub async fn list_layouts() -> Result<Vec<LayoutInfo>, String> {
    let root = get_layouts_root().ok_or("Cannot determine layouts directory")?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let mut infos: Vec<LayoutInfo> = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let stem = match path.file_stem().and_then(|n| n.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        if stem.starts_with('.') {
            continue;
        }
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let layout: LayoutFile = match serde_json::from_str(&content) {
            Ok(l) => l,
            Err(_) => continue,
        };
        let id = if layout.id.is_empty() {
            stem
        } else {
            layout.id.clone()
        };
        infos.push(LayoutInfo {
            id,
            name: layout.name,
        });
    }
    infos.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(infos)
}

#[tauri::command]
pub async fn get_layout(id: String) -> Result<LayoutFile, String> {
    let path = layout_path(&id)?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut layout = serde_json::from_str::<LayoutFile>(&content).map_err(|e| e.to_string())?;

    let mut needs_save = false;

    // Backfill id if missing (old files pre-redesign).
    if layout.id.is_empty() {
        layout.id = id.clone();
        needs_save = true;
    }

    // Assign IDs to widgets that lack one, deduplicate collisions.
    let mut seen = std::collections::HashSet::new();
    for w in &mut layout.widgets {
        let zero = super::widget::WidgetId(0);
        if w.id == zero || !seen.insert(w.id) {
            w.id = super::widget::WidgetId::new();
            needs_save = true;
        }
    }

    if needs_save {
        let json = serde_json::to_string_pretty(&layout).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        tracing::info!(target: TARGET, layout = %id, "migrated layout");
    }

    Ok(layout)
}

#[tauri::command]
pub async fn set_active_layout(id: Option<String>, app: tauri::AppHandle) -> Result<(), String> {
    tracing::debug!(target: TARGET, layout = ?id, "invoke: set_active_layout");
    let state = app.state::<crate::AppState>();
    let mut state = state.lock().await;
    state.config.set_active_layout(id, &app)
}

#[tauri::command]
pub async fn save_layout(id: String, layout: LayoutFile) -> Result<(), String> {
    let path = layout_path(&id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&layout).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_layout(id: String) -> Result<(), String> {
    let path = layout_path(&id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_layout_grid(
    id: String,
    grid_rows: u32,
    grid_cols: u32,
    gap: u32,
    padding: GridPadding,
) -> Result<(), String> {
    let path = layout_path(&id)?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut layout: LayoutFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    layout.grid = GridSettings {
        grid_rows,
        grid_cols,
        gap,
        padding,
    };
    let json = serde_json::to_string_pretty(&layout).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_layout(
    old_id: String,
    new_name: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let old_path = layout_path(&old_id)?;
    let content = fs::read_to_string(&old_path).map_err(|e| e.to_string())?;
    let mut layout: LayoutFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let new_id = uuid::Uuid::new_v4().to_string();
    layout.id = new_id.clone();
    layout.name = new_name;

    let new_path = layout_path(&new_id)?;
    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&layout).map_err(|e| e.to_string())?;
    fs::write(&new_path, json).map_err(|e| e.to_string())?;
    fs::remove_file(&old_path).map_err(|e| e.to_string())?;

    // If this was the active layout, switch active pointer to the new ID.
    let state = app.state::<crate::AppState>();
    let mut state = state.lock().await;
    if state.config.active_layout.as_deref() == Some(&old_id) {
        state.config.set_active_layout(Some(new_id.clone()), &app)?;
    }

    Ok(new_id)
}

#[tauri::command]
pub async fn open_layouts_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let root = get_layouts_root().ok_or("Cannot determine layouts directory")?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(root.to_str().ok_or("Invalid path encoding")?, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_widget(
    widget_id: super::WidgetId,
    config: super::WidgetConfig,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let active_id = {
        let state = app.state::<crate::AppState>();
        let state = state.lock().await;
        state
            .config
            .active_layout
            .clone()
            .ok_or("no active layout")?
    };
    let path = layout_path(&active_id)?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut layout = serde_json::from_str::<LayoutFile>(&content).map_err(|e| e.to_string())?;
    let widget = layout
        .widgets
        .iter_mut()
        .find(|w| w.id == widget_id)
        .ok_or_else(|| format!("widget {widget_id:?} not found in layout {active_id}"))?;
    *widget = config.clone();
    widget.id = widget_id;
    let json = serde_json::to_string_pretty(&layout).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    crate::events::emit_widget_updated(&app, widget_id, &config);
    Ok(())
}

/// Re-seeds all embedded default themes and layouts, overwriting existing files by ID.
/// Does not touch config.json or any non-default files.
#[tauri::command]
pub async fn restore_defaults() -> Result<(), String> {
    crate::theme::ensure_default_themes();
    super::ensure_default_layouts();
    tracing::info!(target: TARGET, "restore_defaults complete");
    Ok(())
}

/* Preferences commands  */

#[tauri::command]
pub async fn set_preferences(prefs: Preferences, app: tauri::AppHandle) -> Result<(), String> {
    tracing::debug!(target: TARGET, "invoke: set_preferences");
    let state = app.state::<crate::AppState>();
    let mut state = state.lock().await;
    state.config.preferences = prefs.clone();
    super::file::write_config(&state.config).map_err(|e| {
        tracing::error!(target: TARGET, error = %e, "failed to write config");
        e.to_string()
    })?;
    crate::events::emit_preferences_changed(&app, &prefs);
    Ok(())
}

#[tauri::command]
pub async fn set_onboarding(
    chapter: String,
    progress: ChapterProgress,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tracing::debug!(target: TARGET, chapter = %chapter, "invoke: set_onboarding");
    let state = app.state::<crate::AppState>();
    let mut state = state.lock().await;
    state.config.set_onboarding(chapter, progress, &app)
}

#[tauri::command]
pub async fn preview_preferences(prefs: Preferences, app: tauri::AppHandle) -> Result<(), String> {
    tracing::trace!(target: TARGET, "invoke: preview_preferences");
    crate::events::emit_preferences_preview(&app, &prefs);
    Ok(())
}
