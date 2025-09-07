use std::sync::{Arc, Mutex};
use tauri::Manager;

mod media;
mod system;

struct AppStateInner {
    system_info: sysinfo::System,
    disks: sysinfo::Disks,
    components: sysinfo::Components,

    visualizer: media::MusicVisualizerFFT,
}

type AppState = Arc<Mutex<AppStateInner>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![

            media::get_media_metadata,
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
            system::gpu::get_gpu_details,
            system::gpu::get_gpu_usage,
            system::gpu::get_vram_usage,
            system::memory::get_memory_usage,
            system::disk::get_disk_details,
            system::temperature::get_temperatures,
        ])
        .setup(|app| {
            app.manage(Arc::new(Mutex::new(AppStateInner {
                system_info: sysinfo::System::new_with_specifics(
                    sysinfo::RefreshKind::nothing()
                        .with_cpu(sysinfo::CpuRefreshKind::everything())
                        .with_memory(sysinfo::MemoryRefreshKind::everything()),
                ),
                disks: sysinfo::Disks::new_with_refreshed_list(),
                components: sysinfo::Components::new_with_refreshed_list(),
                visualizer: media::MusicVisualizerFFT::new(44100.0, 1024, 32, 0.2, 0.08),
            })));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
