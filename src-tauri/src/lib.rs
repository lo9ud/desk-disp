use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
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
    // System information and hardware state
    system_info: sysinfo::System,
    disks: sysinfo::Disks,
    networks: sysinfo::Networks,

    // Application configuration and command-line arguments
    config: config::Config,
    args: cli::Args,
    monitor_cache: config::MonitorCache,

    // File management'
    file_manager: Arc<RwLock<file::FileManager>>,
}

type AppState = Mutex<AppStateInner>;

struct ChannelSubscribers {
    channels: HashMap<&'static str, Arc<AtomicUsize>>,
}

impl ChannelSubscribers {
    fn new() -> Self {
        Self {
            channels: HashMap::new(),
        }
    }

    /// Registers a channel and returns the Arc that should be passed to its loop.
    fn register(&mut self, channel: &'static str) -> Arc<AtomicUsize> {
        let counter = Arc::new(AtomicUsize::new(0));
        self.channels.insert(channel, Arc::clone(&counter));
        counter
    }

    fn get_counter(&self, channel: &str) -> Option<&Arc<AtomicUsize>> {
        self.channels.get(channel)
    }

    pub fn increment(&self, channel: &str) -> usize {
        self.get_counter(channel)
            .map(|c| c.fetch_add(1, Ordering::Relaxed) + 1)
            .unwrap_or(0)
    }

    pub fn decrement(&self, channel: &str) {
        if let Some(c) = self.get_counter(channel) {
            let _ = c.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |v| {
                Some(v.saturating_sub(1))
            });
        }
    }
}

/// Caches the last emitted value per stream channel so new subscribers can
/// receive it immediately without waiting for the next poll tick.
pub struct ChannelCache(std::sync::Mutex<HashMap<String, serde_json::Value>>);

impl ChannelCache {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(HashMap::new()))
    }

    pub fn set(&self, channel: &str, value: serde_json::Value) {
        if let Ok(mut map) = self.0.lock() {
            map.insert(channel.to_string(), value);
        }
    }

    pub fn get(&self, channel: &str) -> Option<serde_json::Value> {
        self.0.lock().ok()?.get(channel).cloned()
    }
}

// Takes an `AppHandle` rather than a window on purpose — see build_monitor_cache in config/mod.rs.
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

#[tauri::command]
async fn subscribe_channel(
    channel: String,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let subs = app.state::<ChannelSubscribers>();
    let count = subs.increment(&channel);
    let last_value = app.state::<ChannelCache>().get(&channel);
    Ok(serde_json::json!({
        "is_first_subscriber": count == 1,
        "last_value": last_value
    }))
}

#[tauri::command]
async fn unsubscribe_channel(channel: String, app: tauri::AppHandle) -> Result<(), String> {
    app.state::<ChannelSubscribers>().decrement(&channel);
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
async fn get_log_level(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let state = state.lock().await;
    Ok(format!("{:?}", state.args.log_level.clone()))
}

#[tauri::command]
async fn exit_program(_app: tauri::AppHandle) {
    info!("Exiting program");
    logging::flush();
    std::process::exit(0);
}

#[tauri::command]
async fn is_dev_mode(app: tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<AppState>();
    let state = state.lock().await;
    Ok(state.args.dev)
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
            is_dev_mode,
            // stream subscription
            subscribe_channel,
            unsubscribe_channel,
            // config commands
            get_config_path,
            get_config,
            log_from_frontend,
            get_log_level,
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

            // Everything state-related (`app.manage()`) must happen before any webview is
            // built below: building a window starts loading frontend JS immediately, and
            // its very first render can `invoke()` a command that reads this state (e.g.
            // App.tsx's is_dev_mode/get_config hooks). If that invoke is dispatched before
            // manage() runs, `app.state::<AppState>()` panics with "state() called before
            // manage()" — a race that's normally too fast to hit, but becomes real once
            // window creation gets slow enough (e.g. --remote-debugging-port) for the page
            // to load within it. Monitor lookups use the AppHandle instead of the (not yet
            // built) window so this ordering is possible at all — see build_monitor_cache.
            let dev = args.dev;
            let target_monitor = get_monitor(app.handle(), &config).expect("Failed to get target monitor");
            let monitor_cache =
                config::build_monitor_cache(app.handle(), target_monitor.name().map(|s| s.as_str()));

            let file_manager = Arc::new(RwLock::new(file::FileManager::new()));

            app.manage::<AppState>(Mutex::new(AppStateInner {
                system_info: sysinfo::System::new_with_specifics(
                    sysinfo::RefreshKind::nothing()
                        .with_cpu(sysinfo::CpuRefreshKind::everything())
                        .with_memory(sysinfo::MemoryRefreshKind::everything()),
                ),
                disks: sysinfo::Disks::new_with_refreshed_list(),
                networks: sysinfo::Networks::new_with_refreshed_list(),
                config,
                args,
                monitor_cache,
                file_manager,
            }));

            /* Channel subscription counters and cache  */

            let mut channel_subs = ChannelSubscribers::new();
            let system_subs = channel_subs.register("system");
            let media_subs = channel_subs.register("media");
            let visualizer_subs = channel_subs.register("visualizer");
            let hardware_subs = channel_subs.register("hardware");
            app.manage(channel_subs);
            app.manage(ChannelCache::new());

            /* Windows — only now, with all state already managed  */

            let url = tauri::WebviewUrl::App("index.html".into());
            let mut win_builder = tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("desk-disp")
                .always_on_bottom(true)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .disable_drag_drop_handler();

            // If dev mode is enabled, override some window properties to make it easier to debug/manipulate the window.
            win_builder = if dev {
                win_builder
                    .skip_taskbar(false)
                    .resizable(true)
                    .decorations(true)
                    .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222")
            } else {
                win_builder
            };

            let win = win_builder.build().expect("Failed to create main window");
            place_window(&win, target_monitor);

            config::get_or_create_settings_window(app.handle())
                .expect("Failed to create settings window");

            win.show().expect("Failed to show window");

            /* Background event loops  */

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(system::run_system_loop(
                handle.clone(),
                Arc::clone(&system_subs),
                Duration::from_millis(500),
            ));
            tauri::async_runtime::spawn(media::run_media_loop(
                handle.clone(),
                Arc::clone(&media_subs),
                Duration::from_secs(2),
            ));
            tauri::async_runtime::spawn(system::run_hardware_loop(
                handle.clone(),
                Arc::clone(&hardware_subs),
                Duration::from_millis(500),
            ));
            media::spawn_visualizer_loop(
                handle,
                Arc::clone(&visualizer_subs),
                Duration::from_millis(33),
            );

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
