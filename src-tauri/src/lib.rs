use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{
    async_runtime::{Mutex, RwLock},
    Manager, Monitor,
};
use tracing::{debug, info};

pub mod cli;
mod config;
mod error;
pub mod events;
mod file;
mod logging;
mod media;
mod system;

struct AppStateInner {
    config: config::Config,
    monitor_cache: config::MonitorCache,

    // File management
    file_manager: Arc<RwLock<file::FileManager>>,
}

type AppState = Mutex<AppStateInner>;

/// Extra WebView2 browser args used in dev mode.
const DEV_BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222";

/// Global every webview receives its parsed [`cli::Args`] on.
const CLI_ARGS_GLOBAL: &str = "__DESK_DISP_ARGS__";

fn cli_args_script(args: &cli::Args) -> String {
    format!(
        "window.{CLI_ARGS_GLOBAL} = Object.freeze({});",
        serde_json::to_string(args).expect("CLI args are serialisable")
    )
}

pub fn prepare_webview<'a, R: tauri::Runtime, M: Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
    args: &cli::Args,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    let builder = builder.initialization_script(cli_args_script(args));
    if args.dev {
        builder.additional_browser_args(DEV_BROWSER_ARGS)
    } else {
        builder
    }
}

/// Caches the last emitted value per stream channel so new subscribers can
/// receive it immediately without waiting for the next event.
pub struct ChannelCache(std::sync::Mutex<HashMap<events::StreamName, serde_json::Value>>);

impl ChannelCache {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(HashMap::new()))
    }

    pub fn set(&self, channel: events::StreamName, value: serde_json::Value) {
        if let Ok(mut map) = self.0.lock() {
            map.insert(channel, value);
        }
    }

    pub fn get(&self, channel: events::StreamName) -> Option<serde_json::Value> {
        self.0.lock().ok()?.get(&channel).cloned()
    }
}

fn get_monitor(app: &tauri::AppHandle, config: &config::Config) -> Result<Monitor, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;

    if monitors.is_empty() {
        return Err("No monitors found".into());
    }
    let monitor_name = config.monitor.as_deref();
    for monitor in monitors {
        if let Some(name) = monitor.name() {
            if let Some(target) = monitor_name {
                if name == target {
                    return Ok(monitor);
                }
            }
        }
    }

    if let Ok(Some(primary)) = app.primary_monitor() {
        return Ok(primary);
    }

    Err("No monitors found".into())
}


/// Marks this window as wanting `channel`, and returns the last cached frame (if any) so a
/// first subscriber renders immediately instead of waiting a full poll interval.
#[tauri::command]
async fn start_stream(
    channel: events::StreamName,
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    app.state::<Arc<events::StreamHints>>()
        .start(channel, window.label());
    Ok(app.state::<ChannelCache>().get(channel))
}

#[tauri::command]
async fn stop_stream(
    channel: events::StreamName,
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<(), String> {
    app.state::<Arc<events::StreamHints>>()
        .stop(channel, window.label());
    Ok(())
}

/// Drops every hint this window holds.
#[tauri::command]
async fn reset_streams(window: tauri::Window, app: tauri::AppHandle) -> Result<(), String> {
    debug!(window = window.label(), "clearing stream hints");
    app.state::<Arc<events::StreamHints>>()
        .clear_window(window.label());
    Ok(())
}

#[tauri::command]
async fn get_config_path() -> Result<String, String> {
    config::get_config_path()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get config path".into())
}

#[tauri::command]
async fn get_config(app: tauri::AppHandle) -> Result<config::Config, String> {
    let state = app.state::<AppState>();
    let state = state.lock().await;
    Ok(state.config.clone())
}

#[tauri::command]
async fn log_from_frontend(level: String, module: String, message: String, hint: Option<String>) {
    // tracing macros require static targets, so we use "frontend" and prefix the module into body.
    let body = match hint {
        Some(h) => format!("{module}: {message} | {h}"),
        None => format!("{module}: {message}"),
    };
    match level.as_str() {
        "trace" => tracing::trace!(target: "frontend", "{}", body),
        "debug" => tracing::debug!(target: "frontend", "{}", body),
        "warn" => tracing::warn!(target: "frontend", "{}", body),
        "error" => tracing::error!(target: "frontend", "{}", body),
        _ => tracing::info!(target: "frontend", "{}", body),
    }
}

#[tauri::command]
async fn exit_program(_app: tauri::AppHandle) {
    info!("Exiting program");
    logging::flush();
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(args: cli::Args) {
    logging::init(args.log_level.as_str());
    info!("Starting up");
    debug!("Parsed CLI arguments: {:#?}", args);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            exit_program,
            // stream lifecycle hints
            start_stream,
            stop_stream,
            reset_streams,
            // config commands
            get_config_path,
            get_config,
            log_from_frontend,
            // media commands
            media::play_media,
            media::pause_media,
            media::next_track,
            media::prev_track,
            media::toggle_playback,
            // monitor commands
            config::next_monitor,
            config::get_monitor_count,
            // settings commands
            config::open_settings,
            config::close_settings,
            config::toggle_settings_visibility,
            // theme commands
            config::preview_theme,
            config::list_themes,
            config::get_theme,
            config::set_active_theme,
            config::save_theme,
            config::delete_theme,
            config::open_themes_folder,
            // layout commands
            config::list_layouts,
            config::get_layout,
            config::set_active_layout,
            config::save_layout,
            config::delete_layout,
            config::rename_layout,
            config::update_layout_grid,
            config::open_layouts_folder,
            config::update_widget,
            config::restore_defaults,
            // preferences commands
            config::set_preferences,
            config::preview_preferences,
            // onboarding commands
            config::set_onboarding,
            // theme generation
            config::generate_theme,
            // file persistence commands
            file::get_kv,
            file::set_kv,
            file::delete_kv,
            file::list_kv,
            file::get_object,
            file::set_object,
            file::delete_object,
            file::list_objects,
        ])
        .setup(move |app| {
            let config = config::get_config().unwrap_or_else(|e| {
                info!("config load failed ({e}), using defaults");
                config::write_default_config()
            });
            config::ensure_default_themes();
            config::ensure_default_layouts();

            let dev = args.dev;
            let target_monitor = get_monitor(app.handle(), &config).expect("Failed to get target monitor");
            let monitor_cache =
                config::build_monitor_cache(app.handle(), target_monitor.name().map(|s| s.as_str()));

            let file_manager = Arc::new(RwLock::new(file::FileManager::new()));

            app.manage::<AppState>(Mutex::new(AppStateInner {
                config,
                monitor_cache,
                file_manager,
            }));
            app.manage(args.clone());

            let stream_hints = Arc::new(events::StreamHints::new());
            app.manage(Arc::clone(&stream_hints));
            app.manage(ChannelCache::new());


            let url = tauri::WebviewUrl::App("index.html".into());
            let mut win_builder = tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("desk-disp")
                // Below all other windows
                .always_on_bottom(true)
                // No window chrome
                .decorations(false)
                // Transparent background (no white flash on load)
                .transparent(true)
                // No shadow 
                .shadow(false)
                // No taskbar icon
                .skip_taskbar(true)
                // No resize
                .resizable(false)
                // Invisible until we place it on the correct monitor
                .visible(false)
                // Disable zoom hotkeys (`Ctrl`+`+`/`-`/`0`) so they don't interfere with widgets
                .zoom_hotkeys_enabled(false)
                // Accept first mouse click so the user doesn't have to click twice to interact with the window
                .accept_first_mouse(true)
                // Make the window visible on all workspaces (virtual desktops) so it doesn't get hidden when switching workspaces
                .visible_on_all_workspaces(true)
                // Disable drag-and-drop so HTML5 drag-and-drop functions correctly, instead of tauri intercepting the event(s)
                .disable_drag_drop_handler();

            // If dev mode is enabled, override some window properties to make it easier to debug/manipulate the window.
            win_builder = if dev {
                win_builder
                    // Show the window in the taskbar so it can be easily found and manipulated
                    .skip_taskbar(false)
                    // Allow resizing so the developer can resize the window to test different layouts/screen sizes
                    .resizable(true)
                    // Show window chrome so the developer can easily move the window around or minimize/maximize it
                    .decorations(true)
                    // Allow devtools to inspect the window elements
                    .devtools(true)
                    // Allow  zoom hotkeys to test different zoom levels
                    .zoom_hotkeys_enabled(true)
                    // Don't make the window always on bottom so the developer can interact with other windows while debugging
                    .always_on_bottom(false)
            } else {
                win_builder
            };

            let win_builder = prepare_webview(win_builder, &args);

            let win = win_builder.build().expect("Failed to create main window");
            place_window(&win, target_monitor);

            config::get_or_create_settings_window(app.handle())
                .expect("Failed to create settings window");

            win.show().expect("Failed to show window");

            /* Background event loops  */

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(system::run_resource_loop(
                handle.clone(),
                Arc::clone(&stream_hints),
                Duration::from_millis(500),
            ));
            tauri::async_runtime::spawn(media::run_media_loop(
                handle.clone(),
                Arc::clone(&stream_hints),
                Duration::from_secs(2),
            ));
            media::spawn_visualizer_loop(handle, stream_hints, Duration::from_millis(33));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn place_window(win: &tauri::WebviewWindow, target_monitor: Monitor) {
    let work_area = target_monitor.work_area();
    let monitor_name = target_monitor.name().map_or("<unknown>", |v| v).to_string();
    info!(monitor = %monitor_name, width = work_area.size.width, height = work_area.size.height, "positioning window");
    // Move first so the window is already on the target monitor when we resize.
    // Using physical pixels avoids any DPI-scale ambiguity on the source monitor.
    // Using the work area (screen minus taskbar) prevents DWM from detecting the
    // window as fullscreen and hiding the taskbar.
    win.set_position(tauri::Position::Physical(work_area.position))
        .expect("Failed to set window position");
    win.set_size(tauri::Size::Physical(work_area.size))
        .expect("Failed to set window size");
}
