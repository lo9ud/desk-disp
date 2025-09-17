use std::{fmt, future::IntoFuture};

use super::Metadata;

use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

use tauri::async_runtime::{block_on, spawn_blocking};

fn to_string_err<T: fmt::Debug>(e: T) -> String {
    format!("{:?}", e)
}

pub async fn get_media_metadata() -> Result<Metadata, String> {
    let session_manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(to_string_err)?
        .await
        .map_err(to_string_err)?;

    let session = session_manager.GetCurrentSession().map_err(to_string_err)?;
    let media_properties = session
        .TryGetMediaPropertiesAsync()
        .map_err(to_string_err)?
        .await
        .map_err(to_string_err)?;

    // Get album artwork
    let album_art = if let Ok(stream) = media_properties
        .Thumbnail()
        .map(|thumb| thumb.OpenReadAsync())
        .map_err(to_string_err)?
    {
        let buffer_result: Result<String, String> = spawn_blocking(move || {
            // All WinRT code here, synchronously
            let stream = block_on(stream.into_future()).map_err(to_string_err)?;
            let size = stream.Size().map_err(to_string_err)? as u32;
            let reader = windows::Storage::Streams::DataReader::CreateDataReader(&stream)
                .map_err(to_string_err)?;
            block_on(reader.LoadAsync(size).map_err(to_string_err)?.into_future())
                .map_err(to_string_err)?;
            let mut buffer = vec![0; size as usize];
            reader.ReadBytes(&mut buffer).map_err(to_string_err)?;
            let b64 = base64::prelude::Engine::encode(
                &base64::engine::general_purpose::STANDARD_NO_PAD,
                &buffer,
            );
            Ok(b64)
        })
        .await
        .map_err(to_string_err)?;
        Some(buffer_result)
    } else {
        None
    };

    return Ok(Metadata {
        title: media_properties
            .Title()
            .map(|s| s.to_string())
            .unwrap_or("Unknown Title".into()),
        artist: media_properties
            .Artist()
            .map(|s| s.to_string())
            .unwrap_or("Unknown Artist".into()),
        album: media_properties
            .AlbumTitle()
            .map(|s| s.to_string())
            .unwrap_or("Unknown Album".into()),
        album_art: album_art.map(|art| art.ok()).flatten(),
    });
}

pub async fn get_media_position() -> Result<u32, String> {
    Ok(0)
}

pub async fn get_play_state() -> Result<bool, String> {
    Ok(true)
}

pub async fn pause_media() -> Result<(), String> {
    Ok(())
}

pub async fn play_media() -> Result<(), String> {
    Ok(())
}

pub async fn toggle_playback() -> Result<(), String> {
    Ok(())
}

pub async fn next_track() -> Result<(), String> {
    Ok(())
}

pub async fn prev_track() -> Result<(), String> {
    Ok(())
}
