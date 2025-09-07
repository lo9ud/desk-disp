#[cfg(target_os = "windows")]
pub mod windows_media;
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
    command: get_media_frequency_data -> Vec<f32>;
    command: pause_media -> ();
    command: play_media -> ();
    command: toggle_playback -> ();
    command: get_play_state -> bool;
    command: next_track -> ();
    command: prev_track -> ();
);

#[derive(serde::Serialize)]
pub struct Metadata {
  pub title: String,
  pub artist: String,
  pub album: String,
  pub album_art: Option<String>, // Base64 encoded image data (e.g., PNG or JPEG)
}

use rustfft::{FftPlanner, Fft, num_complex::Complex};
use std::sync::Arc;

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
        self.previous.iter_mut()
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
        sample_rate: f32, 
        fft_size: usize, 
        num_bands: usize,
        attack: f32,
        decay: f32
    ) -> Self {
        // Create FFT planner and plan
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);
        
        // Pre-allocate FFT buffer
        let fft_buffer = vec![Complex::new(0.0, 0.0); fft_size];
        
        // Generate Hann window
        let window = Self::generate_hann_window(fft_size);
        
        // Create logarithmic frequency bands
        let frequency_bands = Self::create_log_bands(fft_size, sample_rate, num_bands);
        
        // Initialize smoother
        let smoother = Smoother::new(num_bands, attack, decay);
        
        Self {
            fft,
            fft_buffer,
            window,
            frequency_bands,
            smoother,
            sample_rate,
            fft_size,
            num_bands,
        }
    }
    
    /// Process audio samples and return smoothed frequency band magnitudes
    /// 
    /// # Arguments
    /// * `audio_samples` - Raw audio samples (should be exactly fft_size length)
    /// 
    /// # Returns
    /// Vector of smoothed magnitudes for each frequency band (dB scale)
    pub fn process_audio(&mut self, audio_samples: &[f32]) -> Vec<f32> {
        // Ensure we have the right amount of samples
        let samples_to_use = audio_samples.len().min(self.fft_size);
        
        // Apply windowing and copy to FFT buffer
        for i in 0..samples_to_use {
            let windowed_sample = audio_samples[i] * self.window[i];
            self.fft_buffer[i] = Complex::new(windowed_sample, 0.0);
        }
        
        // Zero-pad if necessary
        for i in samples_to_use..self.fft_size {
            self.fft_buffer[i] = Complex::new(0.0, 0.0);
        }
        
        // Perform FFT
        self.fft.process(&mut self.fft_buffer);
        
        // Calculate band magnitudes
        let band_magnitudes = self.calculate_band_magnitudes();
        
        // Apply smoothing and return
        self.smoother.smooth(&band_magnitudes)
    }
    
    /// Convenience constructor with good defaults for music visualization
    pub fn new_music_default(sample_rate: f32) -> Self {
        Self::new(
            sample_rate,
            1024,           // FFT size
            32,             // Number of frequency bands
            0.2,            // Attack (responsive)
            0.08,           // Decay (smooth falloff)
        )
    }
    
    /// Constructor optimized for electronic/EDM music
    pub fn new_edm(sample_rate: f32) -> Self {
        Self::new(sample_rate, 1024, 40, 0.3, 0.1)
    }
    
    /// Constructor optimized for classical music
    pub fn new_classical(sample_rate: f32) -> Self {
        Self::new(sample_rate, 2048, 24, 0.1, 0.05)
    }
    
    /// Constructor optimized for rock/pop music
    pub fn new_rock_pop(sample_rate: f32) -> Self {
        Self::new(sample_rate, 1024, 32, 0.2, 0.08)
    }
    
    // Private helper methods
    
    fn generate_hann_window(size: usize) -> Vec<f32> {
        (0..size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (size - 1) as f32).cos())
            })
            .collect()
    }
    
    fn create_log_bands(fft_size: usize, sample_rate: f32, num_bands: usize) -> Vec<(usize, usize)> {
        let mut bands = Vec::new();
        let min_freq = 20.0; // Hz
        let max_freq = sample_rate / 2.0;
        
        for i in 0..num_bands {
            let freq_low = min_freq * (max_freq / min_freq).powf(i as f32 / num_bands as f32);
            let freq_high = min_freq * (max_freq / min_freq).powf((i + 1) as f32 / num_bands as f32);
            
            let bin_low = ((freq_low * fft_size as f32 / sample_rate) as usize).max(1);
            let bin_high = ((freq_high * fft_size as f32 / sample_rate) as usize).min(fft_size / 2);
            
            if bin_low < bin_high {
                bands.push((bin_low, bin_high));
            }
        }
        bands
    }
    
    fn calculate_band_magnitudes(&self) -> Vec<f32> {
        self.frequency_bands.iter()
            .map(|&(start, end)| {
                // Calculate average magnitude for this frequency band
                let sum: f32 = (start..end)
                    .map(|i| self.fft_buffer[i].norm())
                    .sum();
                
                let average = sum / (end - start) as f32;
                
                // Convert to dB scale with floor to avoid log(0)
                let magnitude_db = (average + 1e-6).log10() * 20.0;
                
                // Normalize to positive range (adjust offset as needed for your visuals)
                (magnitude_db + 60.0).max(0.0) // Assumes noise floor around -60dB
            })
            .collect()
    }
    
    /// Get the frequency range for a specific band (useful for labeling)
    pub fn get_band_frequency_range(&self, band_index: usize) -> Option<(f32, f32)> {
        self.frequency_bands.get(band_index).map(|&(start_bin, end_bin)| {
            let freq_per_bin = self.sample_rate / self.fft_size as f32;
            (start_bin as f32 * freq_per_bin, end_bin as f32 * freq_per_bin)
        })
    }
    
    /// Update smoothing parameters on the fly
    pub fn set_smoothing(&mut self, attack: f32, decay: f32) {
        self.smoother.attack = attack;
        self.smoother.decay = decay;
    }
    
    /// Get current configuration info
    pub fn config_info(&self) -> (f32, usize, usize) {
        (self.sample_rate, self.fft_size, self.num_bands)
    }
}