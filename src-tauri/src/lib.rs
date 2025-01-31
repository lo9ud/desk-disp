use tauri::{Context, Manager};

#[tauri::command]
async fn get_song() -> Result<String, String> {
  Ok(format!("{}", 
    "Song display not yet implemented" 
  ))
  // Ok("Hello, World!".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler!(get_song))
        .setup(|app| {
            let a = app.get_webview_window("main").ok_or("Failed to get window \"main\"")?;
            a.set_always_on_bottom(true)?;
            a.set_ignore_cursor_events(true)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
