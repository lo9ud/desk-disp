#![allow(dead_code)]

use crate::AppState;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

mod linux_media;
mod windows_media;
#[cfg(target_os = "windows")]
mod imp {
    pub use super::windows_media::*;
}
#[cfg(target_os = "linux")]
mod imp {
    pub use super::linux_media::*;
}

use serde_json::Value;
use tauri::Manager; // Import extension trait for .json()

macro_rules! spawn_command {
    (command: $name:ident -> $return_type:ty;) => {
        #[tauri::command]
        pub async fn $name() -> Result<$return_type, String> {
            imp::$name().await
        }
    };

    [$(command: $name:ident -> $return_type:ty;) +] => {
        // Generate individual command functions
        $(spawn_command!(command: $name -> $return_type;);)+
    };
}

spawn_command!(
    command: get_media_metadata -> Metadata;
    command: get_media_position -> u32;
    command: pause_media -> ();
    command: play_media -> ();
    command: toggle_playback -> ();
    command: get_play_state -> bool;
    command: next_track -> ();
    command: prev_track -> ();
);

#[derive(serde::Deserialize, Debug, Clone)]
pub struct SpotifyAccessToken {
    access_token: Arc<String>,
    token_type: Arc<String>,
    expires_in: u32,
}

async fn request_token() -> Result<SpotifyAccessToken, String> {
    // Use client credentials flow to get a token
    let client_id = "bacd8615b652440fbc0661e8939420dd";
    let client_secret = "87c94d8c57fa4228b5385568c32d4646";
    let body = format!(
        "grant_type=client_credentials&client_id={}&client_secret={}",
        client_id, client_secret
    );
    reqwest::Client::new()
        .post("https://accounts.spotify.com/api/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<SpotifyAccessToken>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_high_res_album_art(
    app: tauri::AppHandle,
    track_name: String,
    artist_name: String,
) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    let mut state = state.lock().await;

    // Check if we need a new token
    let need_token = match &state.spotify_api_token {
        Some((acquired, token)) => acquired.elapsed().as_secs() > token.expires_in as u64 - 60,
        None => true,
    };

    if need_token {
        // Request new token without holding the lock
        let new_token = request_token().await?;
        state.spotify_api_token = Some((Instant::now(), new_token));
    }

    let (_, token) = state
        .spotify_api_token
        .clone()
        .expect("Token should be set");

    reqwest::Client::new()
        .get("https://api.spotify.com/v1/search")
        .query(&[
            ("q", format!("track:{} artist:{}", track_name, artist_name)),
            ("type", "track".to_string()),
            ("limit", "1".to_string()),
        ])
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
        .and_then(|value| {
            return Ok(Some(value
                .get("tracks")
                .ok_or("No 'tracks' field in response")
                .and_then(|t| t.get("items").ok_or("No 'items' field in 'tracks'"))
                .and_then(|i| i.as_array().ok_or("No 'items' array in 'tracks'"))
                .and_then(|arr| arr.get(0).ok_or("No tracks in 'items' array"))
                .and_then(|item| item.get("album").ok_or("No 'album' field in track"))
                .and_then(|album| album.get("images").ok_or("No 'images' field in album"))
                .and_then(|imgs| imgs.as_array().ok_or("No images in 'images' array"))
                .and_then(|arr| Ok(arr.into_iter().map(|a| (a.get("url"), a.get("height"), a.get("width"))).collect::<Vec<_>>()))
                .and_then(|urls| {
                    // Prefer the largest image available
                    urls.into_iter().max_by_key(|(_, h, w)| {
                        h.and_then(|h| h.as_u64())
                            .unwrap_or(0)
                            .saturating_mul(w.and_then(|w| w.as_u64()).unwrap_or(0))
                    }).ok_or("No max image found")
                })
                .and_then(|(url, _, _)| url.and_then(|u| u.as_str()).map(|s| s.to_string()).ok_or("No URL string found"))?));
        })
}

// let request_url = reqwest::Url::parse_with_params(
//     "https://api.spotify.com/v1/search",
//     [
//         ("method", "track.getinfo"),
//         ("api_key", "dd73c379a24fa66056bcc273fa4165e7"),
//         ("track", &track_name),
//         ("artist", &artist_name),
//         ("format", "json"),
//     ],
// )
// .map_err(|e| e.to_string())?;

// let response = reqwest::get(request_url).await.map_err(|e| e.to_string())?;
// let value: Value = serde_json::from_str(&response.text().await.map_err(|e| e.to_string())?)
//     .map_err(|e| e.to_string())?;

// const SIZES: [&str; 5] = ["small", "medium", "large", "extralarge", "mega"];

// let track = value.get("track").ok_or("No 'track' field in response")?;
// let album = track.get("album").ok_or("No 'album' field in response")?;
// let images = album
//     .get("image")
//     .and_then(|v| v.as_array())
//     .ok_or("No 'image' array in response")?;
// for size in SIZES.iter().rev() {
//     if let Some(image) = images
//         .iter()
//         .find(|img| img.get("size").and_then(|s| s.as_str()) == Some(*size))
//     {
//         if let Some(url) = image.get("#text").and_then(|u| u.as_str()) {
//             if !url.is_empty() {
//                 return Ok(Some(url.to_string()));
//             }
//         }
//     }
// }
//     Ok(None)
// }

#[tauri::command]
pub async fn get_media_frequency_data(
    app: tauri::AppHandle,
) -> Result<Vec<FrequencyReading>, String> {
    let state = app.state::<AppState>();
    let mut state = state.lock().await;

    // Get the frequency data from the visualizer
    let frequency_data = state.visualizer.get();
    Ok(frequency_data)
}

#[derive(serde::Serialize)]
pub struct Metadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art: Option<String>, // Base64 encoded image data (e.g., PNG or JPEG)
}

#[tauri::command]
pub async fn get_visualiser_device(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let state = state.lock().await;

    Ok(state.visualizer.device_name.clone())
}

use cpal::{self, Device, Stream, StreamConfig};
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::Arc;
use std::time::Instant;

#[derive(serde::Serialize, Clone, Debug)]
pub struct FrequencyReading {
    pub freq_hi: f32,
    pub freq_lo: f32,
    pub magnitude: f32,
}

pub struct FFTStream {
    // Device
    device_name: String,

    // FFT processing
    fft: Arc<dyn Fft<f32>>,
    fft_buffer: Vec<Complex<f32>>,
    fft_size: usize,

    // Configuration
    channels: usize,
    sample_rate: f32,

    // Stream
    _stream: Stream,
    data_receiver: Receiver<Vec<f32>>,

    // Audio buffer accumulation
    audio_buffer: Vec<f32>,

    // Frequency binning
    frequency_bins: Vec<(f32, f32)>, // (freq_lo, freq_hi) pairs
    bin_indices: Vec<Vec<usize>>,    // FFT bin indices for each frequency bin

    // Temporal smoothing
    smoothed_magnitudes: Vec<f32>,
    attack_coeff: f32,
    decay_coeff: f32,

    // A-weighting curve
    a_weights: Vec<f32>,

    // Windowing
    window: Vec<f32>,
}

impl Default for FFTStream {
    fn default() -> Self {
        Self::new(4096).unwrap()
    }
}

impl FFTStream {
    pub fn new(fft_size: usize) -> Result<Self, Box<dyn std::error::Error>> {
        // Create FFT planner and plan
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);

        // Pre-allocate FFT buffer
        let fft_buffer = vec![Complex::new(0.0, 0.0); fft_size];

        // Get Windows WASAPI loopback device
        let host = cpal::default_host();

        // On Windows, we can use the default output device for loopback capture
        let device = host
            .default_output_device()
            .ok_or("No default output device found")?;

        // Get the device's default configuration
        let supported_config = device
            .default_output_config()
            .map_err(|e| format!("Failed to get default output config: {}", e))?;

        let sample_rate = supported_config.sample_rate().0 as f32;
        let channels = supported_config.channels() as usize;
        let sample_format = supported_config.sample_format();
        let config: StreamConfig = supported_config.into();

        // Create channel for audio data
        let (sender, receiver) = std::sync::mpsc::channel();

        // Build WASAPI loopback stream
        let stream =
            Self::build_wasapi_loopback_stream(&device, &config, sample_format, sender, channels)?;

        stream
            .play()
            .map_err(|e| format!("Failed to start WASAPI loopback stream: {}", e))?;

        // Create logarithmic frequency bins (20Hz to Nyquist)
        let (frequency_bins, bin_indices) =
            Self::create_log_frequency_bins(sample_rate, fft_size, 64);

        // Initialize temporal smoothing
        let smoothed_magnitudes = vec![0.0; frequency_bins.len()];
        let attack_coeff = Self::time_constant_to_coeff(0.01, sample_rate / fft_size as f32); // 10ms attack
        let decay_coeff = Self::time_constant_to_coeff(0.3, sample_rate / fft_size as f32); // 100ms decay

        // Create A-weighting curve
        let a_weights = Self::create_a_weighting(&frequency_bins);

        // Create Hann window
        let window = Self::create_hann_window(fft_size);

        Ok(Self {
            device_name: device.name()?,
            fft,
            fft_buffer,
            sample_rate,
            fft_size,
            _stream: stream,
            data_receiver: receiver,
            audio_buffer: Vec::new(),
            channels,
            frequency_bins,
            bin_indices,
            smoothed_magnitudes,
            attack_coeff,
            decay_coeff,
            a_weights,
            window,
        })
    }

    fn build_wasapi_loopback_stream(
        device: &Device,
        config: &StreamConfig,
        sample_format: cpal::SampleFormat,
        sender: Sender<Vec<f32>>,
        channels: usize,
    ) -> Result<Stream, Box<dyn std::error::Error>> {
        let err_fn = |err| eprintln!("WASAPI loopback error: {}", err);

        // Windows WASAPI supports loopback capture from output devices
        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                device.build_input_stream(
                    config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        // Convert to mono if stereo
                        let mono_data = if channels == 2 {
                            data.chunks_exact(2)
                                .map(|frame| (frame[0] + frame[1]) * 0.5)
                                .collect()
                        } else if channels == 1 {
                            data.to_vec()
                        } else {
                            // Handle other channel counts by mixing down
                            data.chunks_exact(channels)
                                .map(|frame| {
                                    let sum: f32 = frame.iter().sum();
                                    sum / channels as f32
                                })
                                .collect()
                        };
                        let _ = sender.send(mono_data);
                    },
                    err_fn,
                    None,
                )?
            }
            cpal::SampleFormat::I16 => device.build_input_stream(
                config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let float_data: Vec<f32> = if channels == 2 {
                        data.chunks_exact(2)
                            .map(|frame| {
                                let left = frame[0] as f32 / i16::MAX as f32;
                                let right = frame[1] as f32 / i16::MAX as f32;
                                (left + right) * 0.5
                            })
                            .collect()
                    } else if channels == 1 {
                        data.iter().map(|&s| s as f32 / i16::MAX as f32).collect()
                    } else {
                        data.chunks_exact(channels)
                            .map(|frame| {
                                let sum: f32 =
                                    frame.iter().map(|&s| s as f32 / i16::MAX as f32).sum();
                                sum / channels as f32
                            })
                            .collect()
                    };
                    let _ = sender.send(float_data);
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::U16 => device.build_input_stream(
                config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    let float_data: Vec<f32> = if channels == 2 {
                        data.chunks_exact(2)
                            .map(|frame| {
                                let left = (frame[0] as f32 / u16::MAX as f32) - 0.5;
                                let right = (frame[1] as f32 / u16::MAX as f32) - 0.5;
                                (left + right) * 0.5
                            })
                            .collect()
                    } else if channels == 1 {
                        data.iter()
                            .map(|&s| (s as f32 / u16::MAX as f32) - 0.5)
                            .collect()
                    } else {
                        data.chunks_exact(channels)
                            .map(|frame| {
                                let sum: f32 = frame
                                    .iter()
                                    .map(|&s| (s as f32 / u16::MAX as f32) - 0.5)
                                    .sum();
                                sum / channels as f32
                            })
                            .collect()
                    };
                    let _ = sender.send(float_data);
                },
                err_fn,
                None,
            )?,
            _ => return Err("Unsupported sample format for WASAPI loopback".into()),
        };

        Ok(stream)
    }

    fn create_log_frequency_bins(
        sample_rate: f32,
        fft_size: usize,
        num_bins: usize,
    ) -> (Vec<(f32, f32)>, Vec<Vec<usize>>) {
        let nyquist = sample_rate / 2.0;
        let freq_min: f32 = 20.0; // Start from 20 Hz
        let freq_max: f32 = nyquist.min(20000.0); // Cap at 20 kHz or Nyquist

        let log_min = freq_min.ln();
        let log_max = freq_max.ln();
        let log_step = (log_max - log_min) / num_bins as f32;

        let mut frequency_bins = Vec::new();
        let mut bin_indices = Vec::new();

        for i in 0..num_bins {
            let freq_lo = (log_min + i as f32 * log_step).exp();
            let freq_hi = (log_min + (i + 1) as f32 * log_step).exp();

            frequency_bins.push((freq_lo, freq_hi));

            // Find corresponding FFT bin indices
            let bin_lo = ((freq_lo / nyquist) * (fft_size / 2) as f32).floor() as usize;
            let bin_hi = ((freq_hi / nyquist) * (fft_size / 2) as f32).ceil() as usize;

            let indices: Vec<usize> = (bin_lo..=bin_hi.min(fft_size / 2)).collect();
            bin_indices.push(indices);
        }

        (frequency_bins, bin_indices)
    }

    fn create_a_weighting(frequency_bins: &[(f32, f32)]) -> Vec<f32> {
        frequency_bins
            .iter()
            .map(|(freq_lo, freq_hi)| {
                let freq = (freq_lo + freq_hi) / 2.0; // Use center frequency
                Self::a_weighting_response(freq)
            })
            .collect()
    }

    fn a_weighting_response(freq: f32) -> f32 {
        // A-weighting filter response in dB, converted to linear scale
        let f2 = freq * freq;
        let f4 = f2 * f2;

        let numerator = 12194.0_f32.powi(2) * f4;
        let denominator = (f2 + 20.6_f32.powi(2))
            * ((f2 + 107.7_f32.powi(2)) * (f2 + 737.9_f32.powi(2))).sqrt()
            * (f2 + 12194.0_f32.powi(2));

        let response_db = 20.0 * (numerator / denominator).log10() + 2.0;
        10.0_f32.powf(response_db / 20.0) // Convert dB to linear scale
    }

    fn create_hann_window(size: usize) -> Vec<f32> {
        (0..size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (size - 1) as f32).cos())
            })
            .collect()
    }

    fn time_constant_to_coeff(time_constant: f32, sample_rate: f32) -> f32 {
        (-1.0 / (time_constant * sample_rate)).exp()
    }

    pub fn get(&mut self) -> Vec<FrequencyReading> {
        // Accumulate audio data
        while let Ok(data) = self.data_receiver.try_recv() {
            self.audio_buffer.extend_from_slice(&data);
        }

        // Process if we have enough data
        if self.audio_buffer.len() < self.fft_size {
            // Return previous smoothed values if no new data
            return self
                .frequency_bins
                .iter()
                .zip(&self.smoothed_magnitudes)
                .map(|((freq_lo, freq_hi), &magnitude)| FrequencyReading {
                    freq_lo: *freq_lo,
                    freq_hi: *freq_hi,
                    magnitude,
                })
                .collect();
        }

        // Take the most recent fft_size samples
        let start_idx = self.audio_buffer.len() - self.fft_size;
        let audio_slice = &self.audio_buffer[start_idx..];

        // Apply window function with proper scaling and prepare FFT input
        let window_scale = self.window.iter().map(|&w| w * w).sum::<f32>().sqrt();
        for (i, &sample) in audio_slice.iter().enumerate() {
            self.fft_buffer[i] = Complex::new(sample * self.window[i] / window_scale, 0.0);
        }

        // Perform FFT
        self.fft.process(&mut self.fft_buffer);

        // Calculate magnitudes for each frequency bin
        let mut current_magnitudes = Vec::with_capacity(self.frequency_bins.len());
        let mut max_magnitude = 0.0f32;

        for (bin_idx, indices) in self.bin_indices.iter().enumerate() {
            if indices.is_empty() {
                current_magnitudes.push(0.0);
                continue;
            }

            // Sum magnitudes across FFT bins for this frequency bin
            let magnitude: f32 = indices
                .iter()
                .map(|&i| {
                    let complex = &self.fft_buffer[i];
                    (complex.re * complex.re + complex.im * complex.im).sqrt()
                })
                .sum::<f32>()
                / indices.len() as f32; // Average

            // Apply A-weighting
            let weighted_magnitude = magnitude * self.a_weights[bin_idx];

            // Logarithmic scaling
            let log_magnitude = (weighted_magnitude + 1e-10).log10(); // Add small value to avoid log(0)
            let scaled_magnitude = (log_magnitude + 6.0) / 6.0; // Normalize roughly to 0-1 range
            let final_magnitude = scaled_magnitude.max(0.0);

            current_magnitudes.push(final_magnitude);
            max_magnitude = max_magnitude.max(final_magnitude);
        }

        // Normalize to 0-1 range
        if max_magnitude > 0.0 {
            for magnitude in &mut current_magnitudes {
                *magnitude = (*magnitude / max_magnitude).min(1.0);
            }
        }

        // Apply temporal smoothing (attack/decay)
        for (i, &current_mag) in current_magnitudes.iter().enumerate() {
            let smoothed = &mut self.smoothed_magnitudes[i];

            if current_mag > *smoothed {
                // Attack: rise quickly
                *smoothed = *smoothed * self.attack_coeff + current_mag * (1.0 - self.attack_coeff);
            } else {
                // Decay: fall slowly
                *smoothed = *smoothed * self.decay_coeff + current_mag * (1.0 - self.decay_coeff);
            }
        }

        // Keep buffer size reasonable
        if self.audio_buffer.len() > self.fft_size * 2 {
            self.audio_buffer.drain(..self.fft_size);
        }

        // Return frequency readings
        self.frequency_bins
            .iter()
            .zip(&self.smoothed_magnitudes)
            .map(|((freq_lo, freq_hi), &magnitude)| FrequencyReading {
                freq_lo: *freq_lo,
                freq_hi: *freq_hi,
                magnitude,
            })
            .collect()
    }
}
