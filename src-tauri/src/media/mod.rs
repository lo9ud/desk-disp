#![allow(dead_code)]

use std::sync::{atomic::AtomicUsize, Arc};

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
use tauri::Manager;

/* Tauri command wrappers  */

macro_rules! spawn_command {
    (command: $name:ident -> $return_type:ty;) => {
        #[tauri::command]
        pub async fn $name() -> Result<$return_type, String> {
            imp::$name().await
        }
    };
    [$(command: $name:ident -> $return_type:ty;)+] => {
        $(spawn_command!(command: $name -> $return_type;);)+
    };
}

spawn_command!(
    command: pause_media -> ();
    command: play_media -> ();
    command: toggle_playback -> ();
    command: next_track -> ();
    command: prev_track -> ();
);

// Event-loop entry points (called from lib.rs setup)

pub async fn run_media_loop(app: tauri::AppHandle, subscribers: Arc<AtomicUsize>, poll_interval: std::time::Duration) {
    imp::run_media_loop(app, subscribers, poll_interval).await
}

pub fn spawn_visualizer_loop(app: tauri::AppHandle, subscribers: Arc<AtomicUsize>, frame_interval: std::time::Duration) {
    imp::spawn_visualizer_loop(app, subscribers, frame_interval)
}

/* Shared payload types  */

#[derive(serde::Serialize, Clone, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct MediaState {
    /// False when no media session is active; all other fields are empty/zero.
    pub active: bool,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Base64-encoded thumbnail image (JPEG or PNG).
    pub album_art_b64: Option<String>,
    pub position_ms: u64,
    pub duration_ms: u64,
}

impl MediaState {
    pub fn inactive() -> Self {
        Self {
            active: false,
            playing: false,
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            album_art_b64: None,
            position_ms: 0,
            duration_ms: 0,
        }
    }
}

#[derive(serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct FrequencyReading {
    pub freq_hi: f32,
    pub freq_lo: f32,
    pub magnitude: f32,
}

// Spotify / high-res album art

#[derive(serde::Deserialize, Debug, Clone)]
pub struct SpotifyAccessToken {
    pub access_token: Arc<String>,
    pub token_type: Arc<String>,
    pub expires_in: u32,
}

pub struct SpotifyClientAuth {
    pub client_id: String,
    pub client_secret: String,
}

async fn request_token(auth: &SpotifyClientAuth) -> Result<SpotifyAccessToken, String> {
    let body = format!(
        "grant_type=client_credentials&client_id={}&client_secret={}",
        auth.client_id, auth.client_secret
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
    use crate::AppState;
    use std::time::Instant;

    const TARGET: &str = "media::spotify";
    tracing::info!(target: TARGET, track = %track_name, artist = %artist_name, "fetching hi-res album art");

    let state = app.state::<AppState>();
    let mut state = state.lock().await;

    // Check that client credentials were provided
    if let Some(auth) = &state.spotify_auth {
        let need_token = match &state.spotify_api_token {
            Some((acquired, token)) => acquired.elapsed().as_secs() > token.expires_in as u64 - 60,
            None => true,
        };

        if need_token {
            tracing::debug!(target: TARGET, "requesting new Spotify access token");
            let new_token = request_token(auth).await.map_err(|e| {
                tracing::error!(target: TARGET, error = %e, "Spotify token request failed");
                e
            })?;
            tracing::debug!(target: TARGET, expires_in = new_token.expires_in, "Spotify token acquired");
            state.spotify_api_token = Some((Instant::now(), new_token));
        }

        let (_, token) = state
            .spotify_api_token
            .clone()
            .expect("Token should be set");

        tracing::debug!(target: TARGET, track = %track_name, artist = %artist_name, "querying Spotify search API");
        let result = reqwest::Client::new()
            .get("https://api.spotify.com/v1/search")
            .query(&[
                ("q", format!("track:{} artist:{}", track_name, artist_name)),
                ("type", "track".to_string()),
                ("limit", "1".to_string()),
            ])
            .bearer_auth(&token.access_token)
            .send()
            .await
            .map_err(|e| {
                tracing::error!(target: TARGET, error = %e, "Spotify search request failed");
                e.to_string()
            })?
            .json::<Value>()
            .await
            .map_err(|e| e.to_string())
            .and_then(|value| {
                Ok(Some(
                    value
                        .get("tracks")
                        .ok_or("No 'tracks' field in response")
                        .and_then(|t| t.get("items").ok_or("No 'items' field in 'tracks'"))
                        .and_then(|i| i.as_array().ok_or("No 'items' array in 'tracks'"))
                        .and_then(|arr| arr.first().ok_or("No tracks in 'items' array"))
                        .and_then(|item| item.get("album").ok_or("No 'album' field in track"))
                        .and_then(|album| album.get("images").ok_or("No 'images' field in album"))
                        .and_then(|imgs| imgs.as_array().ok_or("No images in 'images' array"))
                        .map(|arr| {
                            arr.iter()
                                .map(|a| (a.get("url"), a.get("height"), a.get("width")))
                                .collect::<Vec<_>>()
                        })
                        .and_then(|urls| {
                            urls.into_iter()
                                .max_by_key(|(_, h, w)| {
                                    h.and_then(|h| h.as_u64())
                                        .unwrap_or(0)
                                        .saturating_mul(w.and_then(|w| w.as_u64()).unwrap_or(0))
                                })
                                .ok_or("No max image found")
                        })
                        .and_then(|(url, _, _)| {
                            url.and_then(|u| u.as_str())
                                .map(|s| s.to_string())
                                .ok_or("No URL string found")
                        })?,
                ))
            });
        match &result {
            Ok(Some(url)) => tracing::info!(target: TARGET, url = %url, "hi-res album art found"),
            Ok(None) => tracing::info!(target: TARGET, "no hi-res album art found"),
            Err(e) => tracing::warn!(target: TARGET, error = %e, "hi-res album art lookup failed"),
        }
        result
    } else {
        tracing::warn!(target: "media::spotify", "no Spotify credentials configured; skipping hi-res art lookup");
        return Ok(None);
    }
}

/// Returns the name of the current default output device — the one the
/// visualizer will capture from.
#[tauri::command]
pub async fn get_visualiser_device() -> Result<String, String> {
    let name = cpal::default_host()
        .default_output_device()
        .ok_or_else(|| {
            tracing::warn!(target: FFT_TARGET, "no default output device found");
            "No default output device".to_string()
        })?
        .name()
        .map_err(|e| e.to_string())?;
    tracing::debug!(target: FFT_TARGET, device = %name, "get_visualiser_device");
    Ok(name)
}

/* FFT stream  */

use cpal::{Device, Stream, StreamConfig};
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::mpsc::{Receiver, Sender};

const FFT_TARGET: &str = "media::fft";

pub struct FFTStream {
    pub device_name: String,
    fft: Arc<dyn Fft<f32>>,
    fft_buffer: Vec<Complex<f32>>,
    pub fft_size: usize,
    pub channels: usize,
    pub sample_rate: f32,
    _stream: Stream,
    data_receiver: Receiver<Vec<f32>>,
    pub audio_buffer: Vec<f32>,
    frequency_bins: Vec<(f32, f32)>,
    bin_indices: Vec<Vec<usize>>,
    smoothed_magnitudes: Vec<f32>,
    attack_coeff: f32,
    decay_coeff: f32,
    a_weights: Vec<f32>,
    window: Vec<f32>,
}

impl FFTStream {
    pub fn new(fft_size: usize) -> Result<Self, Box<dyn std::error::Error>> {
        tracing::debug!(target: FFT_TARGET, fft_size, "FFTStream::new");
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);
        let fft_buffer = vec![Complex::new(0.0, 0.0); fft_size];

        let host = cpal::default_host();
        tracing::debug!(target: FFT_TARGET, host = ?host.id(), "querying default output device");
        let device = host
            .default_output_device()
            .ok_or("No default output device found")?;

        let device_name = device.name().unwrap_or_else(|_| "<unknown>".into());
        tracing::debug!(target: FFT_TARGET, device = %device_name, "selected output device");

        let supported_config = device
            .default_output_config()
            .map_err(|e| format!("Failed to get default output config: {}", e))?;

        let sample_rate = supported_config.sample_rate().0 as f32;
        let channels = supported_config.channels() as usize;
        let sample_format = supported_config.sample_format();
        tracing::debug!(target: FFT_TARGET, sample_rate, channels, format = ?sample_format, "stream config");
        let config: StreamConfig = supported_config.into();

        let (sender, receiver) = std::sync::mpsc::channel();

        tracing::debug!(target: FFT_TARGET, format = ?sample_format, "building WASAPI loopback input stream");
        let stream =
            Self::build_wasapi_loopback_stream(&device, &config, sample_format, sender, channels)?;
        tracing::debug!(target: FFT_TARGET, "input stream built — calling play()");
        stream
            .play()
            .map_err(|e| format!("Failed to start WASAPI loopback stream: {}", e))?;
        tracing::debug!(target: FFT_TARGET, "WASAPI loopback stream playing");

        let (frequency_bins, bin_indices) =
            Self::create_log_frequency_bins(sample_rate, fft_size, 64);
        let smoothed_magnitudes = vec![0.0; frequency_bins.len()];
        let attack_coeff = Self::time_constant_to_coeff(0.01, sample_rate / fft_size as f32);
        let decay_coeff = Self::time_constant_to_coeff(0.3, sample_rate / fft_size as f32);
        let a_weights = Self::create_a_weighting(&frequency_bins);
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
        let err_fn = |err: cpal::StreamError| {
            tracing::error!(target: FFT_TARGET, error = %err, "WASAPI loopback stream error callback fired");
        };

        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                tracing::debug!(target: FFT_TARGET, "building F32 loopback stream");
                device.build_input_stream(
                    config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        let mono = mix_to_mono_f32(data, channels);
                        let _ = sender.send(mono);
                    },
                    err_fn,
                    None,
                )?
            }
            cpal::SampleFormat::I16 => {
                tracing::debug!(target: FFT_TARGET, "building I16 loopback stream");
                device.build_input_stream(
                    config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let float: Vec<f32> =
                            data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                        let _ = sender.send(mix_to_mono_f32(&float, channels));
                    },
                    err_fn,
                    None,
                )?
            }
            cpal::SampleFormat::U16 => {
                tracing::debug!(target: FFT_TARGET, "building U16 loopback stream");
                device.build_input_stream(
                    config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        let float: Vec<f32> = data
                            .iter()
                            .map(|&s| (s as f32 / u16::MAX as f32) - 0.5)
                            .collect();
                        let _ = sender.send(mix_to_mono_f32(&float, channels));
                    },
                    err_fn,
                    None,
                )?
            }
            fmt => {
                tracing::error!(target: FFT_TARGET, format = ?fmt, "unsupported sample format for WASAPI loopback");
                return Err("Unsupported sample format for WASAPI loopback".into());
            }
        };

        Ok(stream)
    }

    fn create_log_frequency_bins(
        sample_rate: f32,
        fft_size: usize,
        num_bins: usize,
    ) -> (Vec<(f32, f32)>, Vec<Vec<usize>>) {
        let nyquist = sample_rate / 2.0;
        let log_min = 20.0_f32.ln();
        let log_max = nyquist.min(20000.0).ln();
        let log_step = (log_max - log_min) / num_bins as f32;

        (0..num_bins)
            .map(|i| {
                let freq_lo = (log_min + i as f32 * log_step).exp();
                let freq_hi = (log_min + (i + 1) as f32 * log_step).exp();
                let bin_lo = ((freq_lo / nyquist) * (fft_size / 2) as f32).floor() as usize;
                let bin_hi = ((freq_hi / nyquist) * (fft_size / 2) as f32).ceil() as usize;
                let indices = (bin_lo..=bin_hi.min(fft_size / 2)).collect();
                ((freq_lo, freq_hi), indices)
            })
            .unzip()
    }

    fn create_a_weighting(bins: &[(f32, f32)]) -> Vec<f32> {
        bins.iter()
            .map(|(lo, hi)| Self::a_weighting_response((lo + hi) / 2.0))
            .collect()
    }

    fn a_weighting_response(freq: f32) -> f32 {
        let f2 = freq * freq;
        let f4 = f2 * f2;
        let num = 12194.0_f32.powi(2) * f4;
        let den = (f2 + 20.6_f32.powi(2))
            * ((f2 + 107.7_f32.powi(2)) * (f2 + 737.9_f32.powi(2))).sqrt()
            * (f2 + 12194.0_f32.powi(2));
        let db = 20.0 * (num / den).log10() + 2.0;
        10.0_f32.powf(db / 20.0)
    }

    fn create_hann_window(size: usize) -> Vec<f32> {
        (0..size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (size - 1) as f32).cos())
            })
            .collect()
    }

    fn time_constant_to_coeff(tc: f32, sr: f32) -> f32 {
        (-1.0 / (tc * sr)).exp()
    }

    pub fn get(&mut self) -> Vec<FrequencyReading> {
        let mut drained = 0usize;
        while let Ok(data) = self.data_receiver.try_recv() {
            drained += data.len();
            self.audio_buffer.extend_from_slice(&data);
        }

        if self.audio_buffer.len() < self.fft_size {
            tracing::trace!(target: FFT_TARGET, buf_len = self.audio_buffer.len(), fft_size = self.fft_size, "buffer underrun — returning smoothed values");
            return self
                .frequency_bins
                .iter()
                .zip(&self.smoothed_magnitudes)
                .map(|((lo, hi), &mag)| FrequencyReading {
                    freq_lo: *lo,
                    freq_hi: *hi,
                    magnitude: mag,
                })
                .collect();
        }

        let start = self.audio_buffer.len() - self.fft_size;
        let audio_slice = &self.audio_buffer[start..];
        let window_scale = self.window.iter().map(|&w| w * w).sum::<f32>().sqrt();

        for (i, &s) in audio_slice.iter().enumerate() {
            self.fft_buffer[i] = Complex::new(s * self.window[i] / window_scale, 0.0);
        }
        self.fft.process(&mut self.fft_buffer);

        let mut current = Vec::with_capacity(self.frequency_bins.len());
        let mut max_mag = 0.0_f32;

        for (bin_idx, indices) in self.bin_indices.iter().enumerate() {
            if indices.is_empty() {
                current.push(0.0);
                continue;
            }
            let mag: f32 = indices
                .iter()
                .map(|&i| {
                    let c = &self.fft_buffer[i];
                    (c.re * c.re + c.im * c.im).sqrt()
                })
                .sum::<f32>()
                / indices.len() as f32;

            let weighted = mag * self.a_weights[bin_idx];
            let scaled = ((weighted + 1e-10).log10() + 6.0) / 6.0;
            let final_mag = scaled.max(0.0);
            current.push(final_mag);
            max_mag = max_mag.max(final_mag);
        }

        if max_mag > 0.0 {
            for m in &mut current {
                *m = (*m / max_mag).min(1.0);
            }
        }

        for (i, &cur) in current.iter().enumerate() {
            let s = &mut self.smoothed_magnitudes[i];
            let coeff = if cur > *s {
                self.attack_coeff
            } else {
                self.decay_coeff
            };
            *s = *s * coeff + cur * (1.0 - coeff);
        }

        if self.audio_buffer.len() > self.fft_size * 2 {
            self.audio_buffer.drain(..self.fft_size);
        }

        self.frequency_bins
            .iter()
            .zip(&self.smoothed_magnitudes)
            .map(|((lo, hi), &mag)| FrequencyReading {
                freq_lo: *lo,
                freq_hi: *hi,
                magnitude: mag,
            })
            .collect()
    }
}

fn mix_to_mono_f32(data: &[f32], channels: usize) -> Vec<f32> {
    if channels == 1 {
        return data.to_vec();
    }
    data.chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}
