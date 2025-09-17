use std::time::Instant;
use tauri::{async_runtime::Mutex, Manager, Monitor};

use crate::media::SpotifyAccessToken;

mod config;
mod media;
mod system;

struct AppStateInner {
    system_info: sysinfo::System,
    disks: sysinfo::Disks,
    components: sysinfo::Components,
    networks: sysinfo::Networks,

    spotify_api_token: Option<(Instant, SpotifyAccessToken)>,

    visualizer: media::FFTStream,

    config: config::Config,
}

type AppState = Mutex<AppStateInner>;

fn get_monitor(win: &tauri::WebviewWindow, config: &config::Config) -> Result<Monitor, String> {
    let monitors = win.available_monitors().map_err(|e| e.to_string())?;

    if monitors.is_empty() {
        return Err("No monitors found".into());
    }
    let monitor_name = format!("\\\\.\\DISPLAY{}", config.monitor_index());
    for monitor in monitors {
        if monitor.name().as_deref() == Some(&monitor_name) {
            return Ok(monitor);
        }
    }

    if let Ok(Some(primary)) = win.primary_monitor() {
        return Ok(primary);
    }

    Err("No monitors found".into())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)] 
    let devtools = tauri_plugin_devtools::init();

    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_config_path,
            get_config,
            media::get_media_metadata,
            media::get_visualiser_device,
            media::get_high_res_album_art,
            media::get_media_position,
            media::get_media_frequency_data,
            media::pause_media,
            media::play_media,
            media::toggle_playback,
            media::get_play_state,
            media::next_track,
            media::prev_track,
            system::cpu::get_processors,
            system::cpu::get_cpu_usage,
            system::memory::get_memory_usage,
            system::memory::get_swap_usage,
            system::disk::get_disk_details,
            system::temperature::get_temperatures,
            system::network::get_network_interfaces,
        ])
        .setup(|app| {
            let config = config::get_config().unwrap_or_else(|_| config::write_default_config());

            let win = app
                .get_webview_window("main")
                .expect("Failed to get main window");

            win.set_always_on_bottom(true)
                .expect("Failed to set always on bottom");
            // win.set_ignore_cursor_events(true)
            //     .expect("Failed to set ignore cursor events");

            let target_monitor = get_monitor(&win, &config).expect("Failed to get target monitor");

            let scale_factor = target_monitor.scale_factor();
            let size = target_monitor.size();
            let position = target_monitor.position();
            win.set_size(tauri::Size::Logical(size.to_logical(scale_factor)))
                .expect("Failed to set window size");
            win.set_position(tauri::Position::Physical(*position))
                .expect("Failed to set window position");

            win.show().expect("Failed to show window");

            app.manage::<AppState>(Mutex::new(AppStateInner {
                system_info: sysinfo::System::new_with_specifics(
                    sysinfo::RefreshKind::nothing()
                        .with_cpu(sysinfo::CpuRefreshKind::everything())
                        .with_memory(sysinfo::MemoryRefreshKind::everything()),
                ),
                disks: sysinfo::Disks::new_with_refreshed_list(),
                components: sysinfo::Components::new_with_refreshed_list(),
                networks: sysinfo::Networks::new_with_refreshed_list(),

                spotify_api_token: None,

                visualizer: media::FFTStream::default(),

                config,
            }));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
