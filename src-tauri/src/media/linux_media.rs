use std::sync::{
    atomic::{AtomicUsize},
    Arc,
};

const TARGET: &str = "media::linux";

pub async fn run_media_loop(_app: tauri::AppHandle, _subscribers: Arc<AtomicUsize>, _poll_interval: std::time::Duration) {
    tracing::warn!(target: TARGET, "media loop not implemented on Linux");
}

pub fn spawn_visualizer_loop(_app: tauri::AppHandle, _subscribers: Arc<AtomicUsize>, _frame_interval: std::time::Duration) {
    tracing::warn!(target: TARGET, "visualizer loop not implemented on Linux");
}

pub async fn pause_media() -> Result<(), String> { Ok(()) }
pub async fn play_media() -> Result<(), String> { Ok(()) }
pub async fn toggle_playback() -> Result<(), String> { Ok(()) }
pub async fn next_track() -> Result<(), String> { Ok(()) }
pub async fn prev_track() -> Result<(), String> { Ok(()) }
