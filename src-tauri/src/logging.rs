use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use chrono::Utc;
use tracing::{Event, Subscriber};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::fmt::{
    format::{FormatEvent, FormatFields, Writer},
    FmtContext,
};
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

// Holds the non-blocking writer's flush guard for the lifetime of the process.
// Dropping this signals the background thread to drain and exit.
static WORKER_GUARD: LazyLock<Mutex<Option<WorkerGuard>>> =
    LazyLock::new(|| Mutex::new(None));

/// Format: `[2026-04-21T10:30:00.123Z] [INFO ] [target] message`
struct LogFormatter;

impl<S, N> FormatEvent<S, N> for LogFormatter
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> std::fmt::Result {
        let meta = event.metadata();
        write!(
            writer,
            "[{}] [{:<5}] [{}] ",
            Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ"),
            meta.level(),
            meta.target(),
        )?;
        ctx.field_format().format_fields(writer.by_ref(), event)?;
        writeln!(writer)
    }
}

pub fn init(log_level: &str) {
    let log_dir = log_directory();

    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        eprintln!("Failed to create log directory {:?}: {}", log_dir, e);
    }

    prune_old_logs(&log_dir, 7);

    let file_appender = tracing_appender::rolling::daily(&log_dir, "desk-disp.log");
    let (non_blocking_file, guard) = tracing_appender::non_blocking(file_appender);

    *WORKER_GUARD.lock().unwrap() = Some(guard);

    let file_layer = fmt::layer()
        .event_format(LogFormatter)
        .with_ansi(false)
        .with_writer(non_blocking_file);

    let stderr_layer = fmt::layer()
        .event_format(LogFormatter)
        .with_writer(std::io::stderr);

    // `log=error` silences the tao/winit WARN noise that comes through the log→tracing bridge.
    // CLI --log-level is authoritative; no RUST_LOG fallback.
    let filter = EnvFilter::new(format!("{log_level},log=error"));

    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stderr_layer)
        .init();

    install_panic_hook();

    tracing::info!(
        log_dir = %log_dir.display(),
        "logging initialised"
    );
}

/// Flush logs synchronously. Call before a controlled shutdown if possible.
pub fn flush() {
    // Replacing the guard with None drops it, which blocks until the worker drains.
    if let Ok(mut g) = WORKER_GUARD.lock() {
        drop(g.take());
    }
}

fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!(panic = %info, "PANIC — flushing logs before exit");
        // Give the non-blocking writer's background thread time to drain.
        // flush() would deadlock here (Mutex already poisoned risk), so we sleep.
        std::thread::sleep(Duration::from_millis(500));
        default_hook(info);
    }));
}

fn log_directory() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("desk-disp")
        .join("logs")
}

fn prune_old_logs(dir: &Path, keep_days: u64) {
    let cutoff = std::time::SystemTime::now()
        .checked_sub(Duration::from_secs(keep_days * 86_400))
        .unwrap_or(std::time::UNIX_EPOCH);

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        if !name.starts_with("desk-disp.log") {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if modified < cutoff {
                    if let Err(e) = std::fs::remove_file(&path) {
                        tracing::warn!(path = %path.display(), error = %e, "failed to prune old log");
                    }
                }
            }
        }
    }
}
