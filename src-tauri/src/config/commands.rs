use std::fs;

use tauri::Manager;

use crate::{config::ThemeVar, place_window};

use super::{
    get_layouts_root, get_themes_root, layout_path, theme_path, GridPadding, GridSettings,
    LayoutFile, LayoutInfo, Preferences, ThemeData, ThemeInfo, TARGET,
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

/* Theme commands  */

/// Returns `ThemeInfo { id, name }` for every theme in the flat themes directory.
/// Files beginning with `.` are hidden.
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

#[tauri::command]
pub async fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    tracing::info!(target: TARGET, "open_settings");
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.set_focus();
        win.show().map_err(|e| format!("{:?}", e))
    } else {
        tracing::warn!(target: TARGET, "settings window not found");
        Err("Failed to open settings window".into())
    }
}

/* Layout commands  */

/// Returns `LayoutInfo { id, name }` for every layout in the flat layouts directory.
/// Files beginning with `.` are hidden.
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
    super::ensure_default_themes();
    super::ensure_default_layouts();
    tracing::info!(target: TARGET, "restore_defaults complete");
    Ok(())
}

/* Generate-from-colour (OKLCH palette)  */

fn hex_to_linear(c: u8) -> f64 {
    let s = c as f64 / 255.0;
    if s <= 0.04045 {
        s / 12.92
    } else {
        ((s + 0.055) / 1.055_f64).powf(2.4)
    }
}

fn srgb_to_oklab(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let rl = hex_to_linear(r);
    let gl = hex_to_linear(g);
    let bl = hex_to_linear(b);
    let l = (0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl).cbrt();
    let m = (0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl).cbrt();
    let s = (0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl).cbrt();
    (
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    )
}

fn oklab_to_oklch(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    let c = (a * a + b * b).sqrt();
    let h = b.atan2(a).to_degrees().rem_euclid(360.0);
    (l, c, h)
}

fn oklch_to_oklab(l: f64, c: f64, h: f64) -> (f64, f64, f64) {
    let h_rad = h.to_radians();
    (l, c * h_rad.cos(), c * h_rad.sin())
}

fn oklab_to_linear_srgb(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    let l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = l - 0.0894841775 * a - 1.2914855480 * b;
    let l3 = l_ * l_ * l_;
    let m3 = m_ * m_ * m_;
    let s3 = s_ * s_ * s_;
    (
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
    )
}

fn linear_to_srgb_channel(c: f64) -> u8 {
    let v = if c <= 0.0031308 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    };
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn oklch_to_hex(l: f64, c: f64, h: f64) -> String {
    let (lab_l, lab_a, lab_b) = oklch_to_oklab(l, c, h);
    let (rl, gl, bl) = oklab_to_linear_srgb(lab_l, lab_a, lab_b);
    format!(
        "#{:02x}{:02x}{:02x}",
        linear_to_srgb_channel(rl),
        linear_to_srgb_channel(gl),
        linear_to_srgb_channel(bl),
    )
}

fn hue_to_name(h: f64) -> &'static str {
    match h as u32 {
        0..=14 => "Red",
        15..=44 => "Orange",
        45..=59 => "Amber",
        60..=74 => "Yellow",
        75..=104 => "Lime",
        105..=149 => "Green",
        150..=179 => "Teal",
        180..=209 => "Cyan",
        210..=239 => "Sky",
        240..=269 => "Blue",
        270..=299 => "Violet",
        300..=329 => "Purple",
        330..=344 => "Pink",
        _ => "Rose",
    }
}

fn parse_hex(hex: &str) -> Result<(u8, u8, u8), String> {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return Err(format!("invalid hex colour: {hex}"));
    }
    let r = u8::from_str_radix(&h[0..2], 16).map_err(|e| e.to_string())?;
    let g = u8::from_str_radix(&h[2..4], 16).map_err(|e| e.to_string())?;
    let b = u8::from_str_radix(&h[4..6], 16).map_err(|e| e.to_string())?;
    Ok((r, g, b))
}

fn make_theme(seed_hex: &str, dark: bool) -> Result<ThemeData, String> {
    let (r, g, b) = parse_hex(seed_hex).map_err(|err| err.to_string())?;
    let (lab_l, lab_a, lab_b) = srgb_to_oklab(r, g, b);
    let (_, c, h) = oklab_to_oklch(lab_l, lab_a, lab_b);

    // Clamp chroma for palette generation
    let pc = c.min(0.12);

    let base;
    let surface;
    let border;
    let text;
    let text_dim;
    let text_muted;
    let text_subtle;
    let accent;
    let success;
    let warning;
    let danger;

    if dark {
        base = oklch_to_hex(0.12, pc * 0.5, h);
        surface = oklch_to_hex(0.18, pc * 0.6, h);
        border = oklch_to_hex(0.28, pc * 0.7, h);
        text_subtle = oklch_to_hex(0.48, 0.02, h);
        danger = oklch_to_hex(0.60, 0.20, 25.0);
        text_muted = oklch_to_hex(0.62, 0.02, h);
        accent = oklch_to_hex(0.65_f64.max(lab_l).min(0.78), c.min(0.18), h);
        success = oklch_to_hex(0.65, 0.15, 145.0);
        text_dim = oklch_to_hex(0.80, 0.015, h);
        warning = oklch_to_hex(0.72, 0.15, 75.0);
        text = oklch_to_hex(0.92, 0.01, h);
    } else {
        base = oklch_to_hex(0.92, pc * 0.5, h);
        surface = oklch_to_hex(0.72, pc * 0.6, h);
        border = oklch_to_hex(0.80, pc * 0.7, h);
        text_subtle = oklch_to_hex(0.65, 0.02, h);
        danger = oklch_to_hex(0.65, 0.20, 25.0);
        text_muted = oklch_to_hex(0.62, 0.02, h);
        accent = oklch_to_hex(0.60_f64.max(lab_l).min(0.78), c.min(0.18), h);
        success = oklch_to_hex(0.48, 0.15, 145.0);
        text_dim = oklch_to_hex(0.28, 0.015, h);
        warning = oklch_to_hex(0.28, 0.15, 75.0);
        text = oklch_to_hex(0.12, 0.01, h);
    }

    let color_scheme = if 0.12_f64 < 0.5 { "dark" } else { "light" }.to_string();

    Ok(ThemeData {
        id: format!("_generated_{}", if dark { "dark" } else { "light" }),
        name: format!(
            "{} {} (Generated)",
            hue_to_name(h),
            if dark { "Dark" } else { "Light" }
        ),
        color_scheme,
        vars: vec![
            ThemeVar::Color {
                label: "base".into(),
                value: base,
            },
            ThemeVar::Color {
                label: "surface".into(),
                value: surface,
            },
            ThemeVar::Color {
                label: "border".into(),
                value: border,
            },
            ThemeVar::Color {
                label: "text".into(),
                value: text,
            },
            ThemeVar::Color {
                label: "text-dim".into(),
                value: text_dim,
            },
            ThemeVar::Color {
                label: "text-muted".into(),
                value: text_muted,
            },
            ThemeVar::Color {
                label: "text-subtle".into(),
                value: text_subtle,
            },
            ThemeVar::Color {
                label: "accent".into(),
                value: accent,
            },
            ThemeVar::Color {
                label: "success".into(),
                value: success,
            },
            ThemeVar::Color {
                label: "warning".into(),
                value: warning,
            },
            ThemeVar::Color {
                label: "danger".into(),
                value: danger,
            },
            ThemeVar::Font {
                label: "ui".into(),
                value: vec!["Quicksand".into(), "sans-serif".into()],
            },
            ThemeVar::Font {
                label: "mono".into(),
                value: vec!["monospace".into()],
            },
        ],
    })
}

#[tauri::command]
pub async fn generate_theme(seed_hex: String, app: tauri::AppHandle) -> Result<(), String> {
    use super::{ThemeData, ThemeVar};

    let dark_theme = make_theme(&seed_hex, true)?;
    let light_theme = make_theme(&seed_hex, false)?;

    let dark_path = theme_path("_generated_dark")?;
    if let Some(parent) = dark_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&dark_theme).map_err(|e| e.to_string())?;
    fs::write(&dark_path, json).map_err(|e| e.to_string())?;
    
    let light_path = theme_path("_generated_light")?;
    if let Some(parent) = light_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&light_theme).map_err(|e| e.to_string())?;
    fs::write(&light_path, json).map_err(|e| e.to_string())?;

    let state = app.state::<crate::AppState>();
    let mut state = state.lock().await;

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
pub async fn preview_preferences(prefs: Preferences, app: tauri::AppHandle) -> Result<(), String> {
    tracing::trace!(target: TARGET, "invoke: preview_preferences");
    crate::events::emit_preferences_preview(&app, &prefs);
    Ok(())
}
