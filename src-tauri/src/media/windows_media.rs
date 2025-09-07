use std::{fmt, future::IntoFuture};

use super::Metadata;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
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

pub async fn get_media_frequency_data() -> Result<Vec<f32>, String> {
    let dev = cpal::default_host()
        .default_output_device()
        .ok_or("No output device found".to_string())?;
    let config = dev
        .default_output_config()
        .map_err(|_| "No output config found".to_string())?;

    let sample_format = config.sample_format();
    let config: cpal::StreamConfig = config.into();
    let (tx, rx) = std::sync::mpsc::channel();
    let err_fn = |err| eprintln!("an error occurred on stream: {}", err);
    let stream = match sample_format {
        cpal::SampleFormat::F32 => dev.build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(data.to_vec());
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => dev.build_input_stream(
            &config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                let data_f32: Vec<f32> = data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                let _ = tx.send(data_f32);
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => dev.build_input_stream(
            &config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                let data_f32: Vec<f32> = data
                    .iter()
                    .map(|&s| s as f32 / u16::MAX as f32 - 0.5)
                    .collect();
                let _ = tx.send(data_f32);
            },
            err_fn,
            None,
        ),
        fmt => return Err(format!("Unsupported sample format: {}", fmt)),
    }
    .map_err(to_string_err)?;

    stream.play().map_err(to_string_err)?;

    let samples = rx.recv().map_err(to_string_err)?;
    let fft_size = 1024;
    let mut planner = rustfft::FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_size);
    let mut buffer: Vec<rustfft::num_complex::Complex<f32>> = samples
        .iter()
        .take(fft_size)
        .map(|&s| rustfft::num_complex::Complex { re: s, im: 0.0 })
        .collect();
    buffer.resize(fft_size, rustfft::num_complex::Complex { re: 0.0, im: 0.0 });
    fft.process(&mut buffer);
    let magnitudes: Vec<f32> = buffer.iter().map(|c| c.norm()/((buffer.len() as f32).sqrt())).collect();
    Ok(magnitudes)
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
