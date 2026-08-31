use std::{
    fs::{self, File},
    io::{self, BufReader},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

use serde_json::from_reader;

use crate::config::{Config, TARGET, get_config_path};

/// Serialise to a uniquely-named temp file, then rename over the target, so an
/// interrupted write leaves the previous config intact. The name carries the pid
/// and a counter rather than a fixed `.tmp`, so two writes can never share it.
fn write_atomic(path: &Path, config: &Config) -> io::Result<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!(
        "{}.{}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let data = serde_json::to_vec_pretty(config)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)
}


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
        write_atomic(&path, &default_config).expect("Failed to write default config");
    }
    default_config
}

pub fn write_config(config: &Config) -> io::Result<()> {
    let path = get_config_path().ok_or(io::Error::new(
        io::ErrorKind::NotFound,
        "Could not determine config directory",
    ))?;
    write_atomic(&path, config)?;
    tracing::info!(target: TARGET, path = %path.display(), "config written");
    Ok(())
}
