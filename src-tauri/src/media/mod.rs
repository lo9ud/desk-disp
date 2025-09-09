use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};


#[cfg(target_os = "windows")]
pub mod windows_media;
use tauri::Manager;
#[cfg(target_os = "windows")]
use windows_media as imp;

#[cfg(target_os = "linux")]
pub mod linux_media;
#[cfg(target_os = "linux")]
use linux_media as imp;

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

#[tauri::command]
pub async fn get_media_frequency_data(app: tauri::AppHandle) -> Result<Vec<f32>, String> {
    let state = app.state::<AppState>();
    let mut state = state.lock().unwrap();

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
use rustfft::{FftPlanner, Fft, num_complex::Complex};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, Sender};
use cpal::{self, Device, Stream, StreamConfig};

use crate::AppState;

pub struct MusicVisualizerFFT {
    // FFT processing
    fft: Arc<dyn Fft<f32>>,
    fft_buffer: Vec<Complex<f32>>,
    window: Vec<f32>,

    // Frequency bands
    frequency_bands: Vec<(usize, usize)>,

    // Smoothing
    smoother: Smoother,

    // Configuration
    sample_rate: f32,
    fft_size: usize,
    num_bands: usize,

    // Stream
    _stream: Stream,
    data_receiver: Receiver<Vec<f32>>,
    
    // Audio buffer accumulation
    audio_buffer: Vec<f32>,
    channels: usize,
}

struct Smoother {
    previous: Vec<f32>,
    attack: f32,
    decay: f32,
}

impl Smoother {
    fn new(num_bands: usize, attack: f32, decay: f32) -> Self {
        Self {
            previous: vec![0.0; num_bands],
            attack,
            decay,
        }
    }

    fn smooth(&mut self, new_values: &[f32]) -> Vec<f32> {
        self.previous
            .iter_mut()
            .zip(new_values.iter())
            .map(|(prev, &new)| {
                if new > *prev {
                    *prev += (new - *prev) * self.attack;
                } else {
                    *prev += (new - *prev) * self.decay;
                }
                *prev
            })
            .collect()
    }
}

impl MusicVisualizerFFT {
    pub fn new(
        fft_size: usize,
        num_bands: usize,
        attack: f32,
        decay: f32,
    ) -> Result<Self, Box<dyn std::error::Error>> {
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

        println!("Using WASAPI loopback device: {:?}", device.name());

        // Get the device's default configuration
        let supported_config = device
            .default_output_config()
            .map_err(|e| format!("Failed to get default output config: {}", e))?;

        let sample_rate = supported_config.sample_rate().0 as f32;
        let channels = supported_config.channels() as usize;
        let sample_format = supported_config.sample_format();
        let config: StreamConfig = supported_config.into();

        println!("WASAPI config: {}Hz, {} channels, {:?}", sample_rate, channels, sample_format);

        // Generate Hann window
        let window = Self::generate_hann_window(fft_size);

        // Create logarithmic frequency bands
        let frequency_bands = Self::create_log_bands(fft_size, sample_rate, num_bands);

        println!("Frequency bands: {:#?}", frequency_bands);

        // Initialize smoother
        let smoother = Smoother::new(num_bands, attack, decay);

        // Create channel for audio data
        let (sender, receiver) = std::sync::mpsc::channel();

        // Build WASAPI loopback stream
        let stream = Self::build_wasapi_loopback_stream(&device, &config, sample_format, sender, channels)?;
        
        stream.play()
            .map_err(|e| format!("Failed to start WASAPI loopback stream: {}", e))?;

        println!(
            "MusicVisualizerFFT initialized: {} bands, FFT size {}, sample rate {}Hz",
            num_bands, fft_size, sample_rate
        );

        Ok(Self {
            fft,
            fft_buffer,
            window,
            frequency_bands,
            smoother,
            sample_rate,
            fft_size,
            num_bands,
            _stream: stream,
            data_receiver: receiver,
            audio_buffer: Vec::new(),
            channels,
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
            },
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
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
                            data.iter()
                                .map(|&s| s as f32 / i16::MAX as f32)
                                .collect()
                        } else {
                            data.chunks_exact(channels)
                                .map(|frame| {
                                    let sum: f32 = frame.iter().map(|&s| s as f32 / i16::MAX as f32).sum();
                                    sum / channels as f32
                                })
                                .collect()
                        };
                        let _ = sender.send(float_data);
                    },
                    err_fn,
                    None,
                )?
            },
            cpal::SampleFormat::U16 => {
                device.build_input_stream(
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
                                    let sum: f32 = frame.iter()
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
                )?
            },
            _ => return Err("Unsupported sample format for WASAPI loopback".into()),
        };

        Ok(stream)
    }

    pub fn get(&mut self) -> Vec<f32> {
        // Collect all available audio data
        while let Ok(samples) = self.data_receiver.try_recv() {
            self.audio_buffer.extend(samples);
        }

        // If we don't have enough samples, return previous values (decay naturally)
        if self.audio_buffer.len() < self.fft_size {
            // Apply gentle decay to previous values when no audio
            return self.smoother.previous.iter()
                .map(|&val| val * 0.95) // Gentle decay
                .collect();
        }

        // Keep reasonable buffer size (don't let it grow indefinitely)
        let max_buffer_size = self.fft_size * 4;
        let len = self.audio_buffer.len();
        if len > max_buffer_size {
            let keep_samples = self.fft_size;
            self.audio_buffer.drain(0..len - keep_samples);
        }

        // Take the most recent fft_size samples
        let start_idx = self.audio_buffer.len() - self.fft_size;
        let audio_samples = &self.audio_buffer[start_idx..];

        // Apply windowing and copy to FFT buffer
        for i in 0..self.fft_size {
            let windowed_sample = audio_samples[i] * self.window[i];
            self.fft_buffer[i] = Complex::new(windowed_sample, 0.0);
        }

        // Perform FFT
        self.fft.process(&mut self.fft_buffer);

        // Calculate band magnitudes
        let band_magnitudes = self.calculate_band_magnitudes();

        // Apply smoothing and return
        self.smoother.smooth(&band_magnitudes)
    }

    fn generate_hann_window(size: usize) -> Vec<f32> {
        (0..size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (size - 1) as f32).cos())
            })
            .collect()
    }

    fn create_log_bands(
        fft_size: usize,
        sample_rate: f32,
        num_bands: usize,
    ) -> Vec<(usize, usize)> {
        let mut bands = Vec::new();
        let min_freq: f32 = 0.1; // Hz
        let max_freq: f32 = sample_rate / 2.0;
        let base = (max_freq / min_freq).powf(1.0 / num_bands as f32);

        for i in 0..num_bands {
            let freq_low = min_freq * base.powf(i as f32);
            let freq_high = min_freq * base.powf((i + 1) as f32);

            let bin_low = ((freq_low * fft_size as f32 / sample_rate) as usize).max(1);
            let bin_high = ((freq_high * fft_size as f32 / sample_rate) as usize).min(fft_size / 2);

            if bin_low < bin_high {
                bands.push((bin_low, bin_high));
            }
        }
        bands
    }

    fn calculate_band_magnitudes(&self) -> Vec<f32> {
        self.frequency_bands
            .iter()
            .map(|&(start, end)| {
                // Calculate RMS magnitude for this frequency band
                let sum_squares: f32 = (start..end)
                    .map(|i| {
                        let magnitude = self.fft_buffer[i].norm();
                        magnitude * magnitude
                    })
                    .sum();

                    let rms = (sum_squares / (end - start) as f32).sqrt();

                    // Convert to dB scale with floor to avoid log(0)
                    (rms + 1e-8).log10()
            })
            .collect()
    }

    pub fn get_band_frequency_range(&self, band_index: usize) -> Option<(f32, f32)> {
        self.frequency_bands
            .get(band_index)
            .map(|&(start_bin, end_bin)| {
                let freq_per_bin = self.sample_rate / self.fft_size as f32;
                (
                    start_bin as f32 * freq_per_bin,
                    end_bin as f32 * freq_per_bin,
                )
            })
    }
}

// Convenience constructors optimized for Windows
impl Default for MusicVisualizerFFT {
    fn default() -> Self {
        Self::new(2048, 128, 0.75, 0.5).expect("Failed to create default MusicVisualizerFFT") // Very responsive
    }
}