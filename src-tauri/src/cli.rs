use clap::Parser;
use serde::Serialize;

#[derive(Clone, Debug, clap::ValueEnum, Serialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/ffi_types.ts")]
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

#[derive(Parser, Clone, Debug, Serialize, ts_rs::TS)]
#[command(name = "desk-disp", about = "Desktop display overlay", version = env!("CARGO_PKG_VERSION"))]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct Args {
    /// Enable development mode (renders with decorations + resizeable)
    #[arg(long, default_value_t = false, action = clap::ArgAction::SetTrue)]
    pub dev: bool,

    /// Default log level
    #[arg(long, value_name = "LEVEL", default_value = "info")]
    pub log_level: LogLevel,
}