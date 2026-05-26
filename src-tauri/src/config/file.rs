use std::{fs::{self, File}, io::{self, BufReader}};

use serde_json::from_reader;

use crate::config::{Config, TARGET, get_config_path};


pub fn get_config() -> io::Result<Config> {
    let path = get_config_path().ok_or(io::Error::new(
        io::ErrorKind::NotFound,
        "Could not determine config directory",
    ))?;
    tracing::info!(target: TARGET, path = %path.display(), "loading config");
    let file = File::open(&path).map_err(|e| {
        tracing::warn!(target: TARGET, path = %path.display(), error = %e, "config file not found");
        e
    })?;
    let reader = BufReader::new(file);
    let config: Config = from_reader(reader).map_err(|e| {
        tracing::error!(target: TARGET, path = %path.display(), error = %e, "config parse failed");
        io::Error::new(io::ErrorKind::InvalidData, e)
    })?;
    tracing::info!(target: TARGET, monitor = ?config.monitor, "config loaded");
    Ok(config)
}

pub fn write_default_config() -> Config {
    let default_config: Config = Default::default();
    if let Some(path) = get_config_path() {
        tracing::info!(target: TARGET, path = %path.display(), "writing default config");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("Failed to create config directory");
        }
        let file = File::create(&path).expect("Failed to create config file");
        serde_json::to_writer_pretty(file, &default_config)
            .expect("Failed to write default config");
    }
    default_config
}

pub fn write_config(config: &Config) -> io::Result<()> {
    let path = get_config_path().ok_or(io::Error::new(
        io::ErrorKind::NotFound,
        "Could not determine config directory",
    ))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let file = File::create(&path)?;
    serde_json::to_writer_pretty(file, config)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    tracing::info!(target: TARGET, path = %path.display(), "config written");
    Ok(())
}
