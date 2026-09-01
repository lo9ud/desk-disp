use std::fs;

use tauri::Manager;

use super::{get_themes_root, theme_path, ThemeData, ThemeInfo, TARGET};

#[tauri::command]
pub async fn list_themes() -> Result<Vec<ThemeInfo>, String> {
    let root = get_themes_root().ok_or("Cannot determine themes directory")?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let mut infos: Vec<ThemeInfo> = Vec::new();
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
        let data: ThemeData = match serde_json::from_str(&content) {
            Ok(d) => d,
            Err(_) => continue,
        };
        infos.push(ThemeInfo {
            id: data.id,
            name: data.name,
        });
    }
    infos.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(infos)
}

#[tauri::command]
pub async fn get_theme(id: String) -> Result<ThemeData, String> {
    tracing::trace!(target: TARGET, theme = %id, "invoke: get_theme");
    let path = theme_path(&id)?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn preview_theme(theme: ThemeData, app: tauri::AppHandle) -> Result<(), String> {
    tracing::trace!(target: TARGET, "invoke: preview_theme");
    let css = theme.to_css();
    crate::events::emit_theme_changed(&app, "preview", &css);
    Ok(())
}

#[tauri::command]
pub async fn set_active_theme(name: Option<String>, app: tauri::AppHandle) -> Result<(), String> {
    tracing::debug!(target: TARGET, theme = ?name, "invoke: set_active_theme");
    let state = app.state::<crate::AppState>();
    let mut state = state.lock().await;
    state.config.set_active_theme(name, &app)
}

#[tauri::command]
pub async fn save_theme(theme: ThemeData) -> Result<(), String> {
    tracing::debug!(target: TARGET, theme = %theme.id, "invoke: save_theme");
    let path = theme_path(&theme.id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&theme).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_theme(id: String) -> Result<(), String> {
    let path = theme_path(&id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_themes_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let root = get_themes_root().ok_or("Cannot determine themes directory")?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(root.to_str().ok_or("Invalid path encoding")?, None::<&str>)
        .map_err(|e| e.to_string())
}
