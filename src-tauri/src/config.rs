use dirs::config_dir;

use serde_json::from_reader;

use std::{
    fs::File,
    io::{self, BufReader},
};



#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
pub struct Config {
    monitor_index: usize,
}

impl Default for Config {
    fn default() -> Self {
        Config { monitor_index: 0 }
    }
}

impl Config {
    pub fn monitor_index(&self) -> usize {
        self.monitor_index
    }
}

pub fn get_config_path() -> Option<std::path::PathBuf> {
    config_dir().map(|mut path| {
        path.push("desk-disp");
        path.push("config.json");
        path
    })
}

pub fn get_config() -> io::Result<Config> {
    let path = get_config_path().ok_or(io::Error::new(
        io::ErrorKind::NotFound,
        "Could not determine config directory",
    ))?;
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let config: Config = from_reader(reader)?;
    Ok(config)
}

pub fn write_default_config() -> Config {
    let default_config: Config = Default::default();
    if let Some(path) = get_config_path() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("Failed to create config directory");
        }
        let file = File::create(path).expect("Failed to create config file");
        serde_json::to_writer_pretty(file, &default_config)
            .expect("Failed to write default config");
    }
    default_config
}