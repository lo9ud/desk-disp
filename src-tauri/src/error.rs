pub enum AppError {
    ConfigError(String),
    MonitorError(String),
    MediaError(String),
    SpotifyError(String),
    Other(String),
}

pub type Result<T> = std::result::Result<T, AppError>;