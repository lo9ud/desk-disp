use clap::{Parser, builder::ArgPredicate};

#[derive(Clone, Debug, clap::ValueEnum)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Trace => "trace",
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }
}

#[derive(Parser, Clone, Debug)]
#[command(name = "desk-disp", about = "Desktop display overlay", version = env!("CARGO_PKG_VERSION"))]
pub struct Args {
    /// Enable development defaults (decorations, shadow, taskbar, resizable, no_always_on_bottom, no_transparent, windowed with 800x600 size)
    #[arg(long, default_value_t = false, action = clap::ArgAction::SetTrue, group = "mode", help_heading = "Modes")]
    pub dev: bool,

    /// Default log level
    #[arg(long, value_name = "LEVEL", default_value = "info")]
    pub log_level: LogLevel,
}