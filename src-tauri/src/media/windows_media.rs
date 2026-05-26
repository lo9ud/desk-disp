use base64::Engine;
use std::fmt;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;
use tracing::trace;
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};

use super::{FFTStream, FrequencyReading, MediaState};

fn emit_media(app: &tauri::AppHandle, state: MediaState) {
    if let Ok(value) = serde_json::to_value(&state) {
        app.state::<crate::ChannelCache>().set("media", value);
    }
    let _ = app.emit(crate::events::STREAM_MEDIA, state);
}

const TARGET: &str = "media::windows";

fn e<T: fmt::Debug>(e: T) -> String {
    format!("{:?}", e)
}

struct SessionCache {
    cached_art: Option<String>,
    last_title_artist: (String, String),
}

impl Default for SessionCache {
    fn default() -> Self {
        Self {
            cached_art: None,
            last_title_artist: (String::new(), String::new()),
        }
    }
}

// Coalesces rapid back-to-back media events into at most one in-flight fetch
// plus one pending retry. Prevents concurrent OpenReadAsync calls on the same
// WinRT stream, which can corrupt the COM heap in misbehaving clients.
#[derive(Default)]
struct FetchState {
    in_flight: bool,
    pending: bool,
    pending_refresh_art: bool,
}

// Holds the active session and its event registration tokens. Revoking happens
// automatically on drop so switching sessions never leaks handlers.
struct AttachedSession {
    session: GlobalSystemMediaTransportControlsSession,
    media_token: i64,
    playback_token: i64,
    timeline_token: i64,
}

impl Drop for AttachedSession {
    fn drop(&mut self) {
        let _ = self.session.RemoveMediaPropertiesChanged(self.media_token);
        let _ = self.session.RemovePlaybackInfoChanged(self.playback_token);
        let _ = self
            .session
            .RemoveTimelinePropertiesChanged(self.timeline_token);
    }
}

/* Media event loop  */

pub async fn run_media_loop(
    app: tauri::AppHandle,
    subscribers: Arc<AtomicUsize>,
    poll_interval: Duration,
) {
    let session_manager = loop {
        tracing::info!(target: TARGET, "acquiring SMTC session manager");
        match get_session_manager().await {
            Ok(m) => {
                tracing::info!(target: TARGET, "SMTC session manager acquired");
                break m;
            }
            Err(err) => {
                tracing::warn!(target: TARGET, error = %err, "session manager init failed; retrying in 5s");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    };

    let cache: Arc<Mutex<SessionCache>> = Arc::new(Mutex::new(SessionCache::default()));
    let attached: Arc<Mutex<Option<AttachedSession>>> = Arc::new(Mutex::new(None));
    let fetch_state: Arc<std::sync::Mutex<FetchState>> =
        Arc::new(std::sync::Mutex::new(FetchState::default()));
    let handle = tokio::runtime::Handle::current();

    // Attach to whichever session is already active.
    attach_current_session(&session_manager, &attached, &cache, &fetch_state, &app, &handle).await;

    // Re-attach whenever the foreground media app changes or all sessions close.
    {
        let attached = Arc::clone(&attached);
        let app_clone = app.clone();
        let cache_clone = Arc::clone(&cache);
        let fetch_state_clone = Arc::clone(&fetch_state);
        let handle_clone = handle.clone();
        let mgr_clone = session_manager.clone();
        let handler = TypedEventHandler::new(move |_, _| {
            tracing::info!(target: TARGET, "current session changed");
            let attached = Arc::clone(&attached);
            let app = app_clone.clone();
            let cache = Arc::clone(&cache_clone);
            let fetch_state = Arc::clone(&fetch_state_clone);
            let handle = handle_clone.clone();
            let inner_handle = handle.clone();
            let mgr = mgr_clone.clone();
            handle.spawn(async move {
                attach_current_session(&mgr, &attached, &cache, &fetch_state, &app, &inner_handle).await;
            });
            Ok(())
        });
        if let Err(err) = session_manager.CurrentSessionChanged(&handler) {
            tracing::error!(target: TARGET, error = ?err, "CurrentSessionChanged registration failed");
        }
    }

    // Keepalive poll — only updates timeline position during active playback.
    // Events cover play/pause/track changes; this catches continuous position drift.
    let mut interval = tokio::time::interval(poll_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        if subscribers.load(Ordering::Relaxed) == 0 {
            continue;
        }
        let Ok(session) = session_manager.GetCurrentSession() else {
            continue;
        };
        let is_playing = session
            .GetPlaybackInfo()
            .ok()
            .and_then(|p| p.PlaybackStatus().ok())
            .map(|s| s == PlaybackStatus::Playing)
            .unwrap_or(false);
        if is_playing {
            let mut guard = cache.lock().await;
            let state = fetch_media_state_from_session(&session, &mut guard, false).await;
            drop(guard);
            emit_media(&app, state);
        }
    }
}

async fn attach_current_session(
    mgr: &GlobalSystemMediaTransportControlsSessionManager,
    attached: &Arc<Mutex<Option<AttachedSession>>>,
    cache: &Arc<Mutex<SessionCache>>,
    fetch_state: &Arc<std::sync::Mutex<FetchState>>,
    app: &tauri::AppHandle,
    handle: &tokio::runtime::Handle,
) {
    *fetch_state.lock().unwrap() = FetchState::default();
    let mut guard = attached.lock().await;
    *guard = None; // revokes old event tokens via Drop

    match mgr.GetCurrentSession() {
        Ok(session) => {
            let source = session
                .SourceAppUserModelId()
                .map(|s| s.to_string())
                .unwrap_or_default();
            tracing::info!(target: TARGET, source = %source, "attaching to media session");
            if source.to_ascii_lowercase().contains("applemusic") {
                tracing::warn!(target: TARGET, "Apple Music session detected: artist\u{2014}album SMTC field will be split on em-dash");
            }
            let mut cache_guard = cache.lock().await;
            let state = fetch_media_state_from_session(&session, &mut cache_guard, true).await;
            drop(cache_guard);
            emit_media(app, state);
            match attach_session(session, app.clone(), Arc::clone(cache), Arc::clone(fetch_state), handle.clone()) {
                Ok(a) => {
                    tracing::info!(target: TARGET, source = %source, "session attached");
                    *guard = Some(a);
                }
                Err(err) => tracing::error!(target: TARGET, error = ?err, "attach_session failed"),
            }
        }
        Err(_) => {
            tracing::info!(target: TARGET, "no active media session");
            emit_media(app, MediaState::inactive());
        }
    }
}

fn attach_session(
    session: GlobalSystemMediaTransportControlsSession,
    app: tauri::AppHandle,
    cache: Arc<Mutex<SessionCache>>,
    fetch_state: Arc<std::sync::Mutex<FetchState>>,
    handle: tokio::runtime::Handle,
) -> windows::core::Result<AttachedSession> {
    macro_rules! event_handler {
        ($refresh_art:expr) => {{
            let s = session.clone();
            let a = app.clone();
            let c = Arc::clone(&cache);
            let fs = Arc::clone(&fetch_state);
            let h = handle.clone();
            TypedEventHandler::new(move |_, _| {
                {
                    let mut state = fs.lock().unwrap();
                    if state.in_flight {
                        state.pending = true;
                        state.pending_refresh_art |= $refresh_art;
                        return Ok(());
                    }
                    state.in_flight = true;
                }
                let session = s.clone();
                let app = a.clone();
                let cache = Arc::clone(&c);
                let fetch_state = Arc::clone(&fs);
                let mut refresh_art = $refresh_art;
                h.spawn(async move {
                    loop {
                        let mut guard = cache.lock().await;
                        let state =
                            fetch_media_state_from_session(&session, &mut guard, refresh_art).await;
                        drop(guard);
                        emit_media(&app, state);

                        let mut fs = fetch_state.lock().unwrap();
                        if fs.pending {
                            refresh_art = fs.pending_refresh_art;
                            fs.pending = false;
                            fs.pending_refresh_art = false;
                        } else {
                            fs.in_flight = false;
                            break;
                        }
                    }
                });
                Ok(())
            })
        }};
    }

    let media_token = session.MediaPropertiesChanged(&event_handler!(true))?;
    let playback_token = session.PlaybackInfoChanged(&event_handler!(false))?;
    let timeline_token = session.TimelinePropertiesChanged(&event_handler!(false))?;

    Ok(AttachedSession {
        session,
        media_token,
        playback_token,
        timeline_token,
    })
}

async fn get_session_manager() -> Result<GlobalSystemMediaTransportControlsSessionManager, String> {
    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(e)?
        .await
        .map_err(e)
}

async fn fetch_media_state_from_session(
    session: &GlobalSystemMediaTransportControlsSession,
    cache: &mut SessionCache,
    refresh_art: bool,
) -> MediaState {
    let props = match session.TryGetMediaPropertiesAsync() {
        Ok(f) => match f.await {
            Ok(p) => p,
            Err(err) => {
                tracing::warn!(target: TARGET, error = ?err, "TryGetMediaPropertiesAsync failed");
                return MediaState::inactive();
            }
        },
        Err(err) => {
            tracing::warn!(target: TARGET, error = ?err, "TryGetMediaPropertiesAsync call failed");
            return MediaState::inactive();
        }
    };

    let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
    let raw_artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
    let raw_album = props
        .AlbumTitle()
        .map(|s| s.to_string())
        .unwrap_or_default();

    // Apple Music via SMTC reports "Artist — Album" in the Artist field with Album empty.
    let source = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();
    let is_apple_music = source.to_ascii_lowercase().contains("applemusic");
    let (artist, album) = if is_apple_music && raw_album.is_empty() {
        if let Some((a, b)) = raw_artist.split_once(" \u{2014} ") {
            (a.to_string(), b.to_string())
        } else {
            (raw_artist, raw_album)
        }
    } else {
        (raw_artist, raw_album)
    };

    let title_changed = (title.as_str(), artist.as_str())
        != (
            cache.last_title_artist.0.as_str(),
            cache.last_title_artist.1.as_str(),
        );
    if title_changed {
        tracing::debug!(target: TARGET, title = %title, artist = %artist, album = %album, "track changed");
        cache.last_title_artist = (title.clone(), artist.clone());
    }

    let should_read = refresh_art || title_changed || cache.cached_art.is_none();

    if should_read {
        cache.cached_art = read_thumbnail(&props).await;
    }

    let (position_ms, duration_ms) = session
        .GetTimelineProperties()
        .map(|t| {
            let pos = t
                .Position()
                .map(|ts| ts.Duration.max(0) / 10_000)
                .unwrap_or(0) as u64;
            let end = t
                .EndTime()
                .map(|ts| ts.Duration.max(0) / 10_000)
                .unwrap_or(0) as u64;
            (pos, end)
        })
        .unwrap_or((0, 0));
    
    let playing = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|p| p.PlaybackStatus().ok())
        .map(|s| s == PlaybackStatus::Playing)
        .unwrap_or(false);
    
    if title.is_empty() && !playing {
        trace!(target: TARGET, "no title and not playing — treating session as inactive");
        return MediaState::inactive();
    }

    MediaState {
        active: true,
        playing,
        title,
        artist,
        album,
        album_art_b64: cache.cached_art.clone(),
        position_ms,
        duration_ms,
    }
}

async fn read_thumbnail(
    props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use windows::Storage::Streams::DataReader;

    tracing::trace!(target: TARGET, "read_thumbnail: opening stream");

    let stream = props
        .Thumbnail()
        .ok()?
        .OpenReadAsync()
        .map_err(|e| tracing::warn!(target: TARGET, error = ?e, "read_thumbnail: OpenReadAsync call failed"))
        .ok()?
        .join()
        .map_err(|e| tracing::warn!(target: TARGET, error = ?e, "read_thumbnail: OpenReadAsync/join failed"))
        .ok()?;

    let size = stream
        .Size()
        .map_err(|e| tracing::warn!(target: TARGET, error = ?e, "read_thumbnail: Size() failed"))
        .ok()?;
    tracing::trace!(target: TARGET, size, "read_thumbnail: stream size");

    if size > u32::MAX as u64 {
        tracing::error!(target: TARGET, size, "read_thumbnail: size exceeds u32::MAX — skipping to avoid LoadAsync truncation");
        return None;
    }
    if size == 0 {
        tracing::warn!(target: TARGET, "read_thumbnail: zero-size stream");
        return None;
    }
    let size = size as u32;

    let reader = DataReader::CreateDataReader(&stream)
        .map_err(|e| tracing::warn!(target: TARGET, error = ?e, "read_thumbnail: CreateDataReader failed"))
        .ok()?;

    let loaded = reader
        .LoadAsync(size)
        .map_err(|e| tracing::warn!(target: TARGET, error = ?e, "read_thumbnail: LoadAsync call failed"))
        .ok()?
        .join()
        .map_err(|e| tracing::warn!(target: TARGET, error = ?e, "read_thumbnail: LoadAsync failed"))
        .ok()?;

    if loaded != size {
        tracing::warn!(target: TARGET, size, loaded, "read_thumbnail: LoadAsync loaded fewer bytes than expected — skipping ReadBytes");
        return None;
    }

    let mut buf = vec![0u8; loaded as usize];
    reader
        .ReadBytes(&mut buf)
        .map_err(|e| tracing::warn!(target: TARGET, error = ?e, "read_thumbnail: ReadBytes failed"))
        .ok()?;

    tracing::trace!(target: TARGET, bytes = buf.len(), "read_thumbnail: encoded thumbnail");
    Some(base64::engine::general_purpose::STANDARD_NO_PAD.encode(&buf))
}

/* Playback controls  */

pub async fn pause_media() -> Result<(), String> {
    let session = current_session().await?;
    session.TryPauseAsync().map_err(e)?.await.map_err(e)?;
    Ok(())
}

pub async fn play_media() -> Result<(), String> {
    let session = current_session().await?;
    session.TryPlayAsync().map_err(e)?.await.map_err(e)?;
    Ok(())
}

pub async fn toggle_playback() -> Result<(), String> {
    let session = current_session().await?;
    session
        .TryTogglePlayPauseAsync()
        .map_err(e)?
        .await
        .map_err(e)?;
    Ok(())
}

pub async fn next_track() -> Result<(), String> {
    let session = current_session().await?;
    session.TrySkipNextAsync().map_err(e)?.await.map_err(e)?;
    Ok(())
}

pub async fn prev_track() -> Result<(), String> {
    let session = current_session().await?;
    session
        .TrySkipPreviousAsync()
        .map_err(e)?
        .await
        .map_err(e)?;
    Ok(())
}

async fn current_session(
) -> Result<windows::Media::Control::GlobalSystemMediaTransportControlsSession, String> {
    get_session_manager().await?.GetCurrentSession().map_err(e)
}

/* Visualizer loop  */

/// Spawns a dedicated thread that owns the FFT stream. Manages its own
/// FFTStream lifecycle — creates on first subscriber, drops when empty,
/// and re-creates automatically if the default output device changes.
pub fn spawn_visualizer_loop(
    app: tauri::AppHandle,
    subscribers: Arc<AtomicUsize>,
    frame_interval: Duration,
) {
    use cpal::traits::{DeviceTrait, HostTrait};

    const VIS_TARGET: &str = "media::visualizer";

    // Install a one-time panic hook that logs to the tracing file before Rust
    // calls ExitProcess with STATUS_FATAL_APP_EXIT. Without this the only
    // signal is the opaque exit code; with it we get the file:line in cpal.
    static HOOK_INIT: std::sync::Once = std::sync::Once::new();
    HOOK_INIT.call_once(|| {
        std::panic::set_hook(Box::new(|info| {
            let location = info
                .location()
                .map(|l| format!("{}:{}", l.file(), l.line()))
                .unwrap_or_else(|| "<unknown>".into());
            let msg = info
                .payload()
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
                .unwrap_or("<non-string panic payload>");
            let thread = std::thread::current();
            let thread_name = thread.name().unwrap_or("<unnamed>");
            // stderr is synchronous — tracing-appender's flush thread may not
            // run before ExitProcess, so this is the only reliable output path.
            eprintln!("[PANIC] thread='{thread_name}' location={location} message={msg}");
            tracing::error!(
                target: "panic",
                location = %location,
                message = %msg,
                thread = thread_name,
                "thread panicked — process will abort"
            );
        }));
    });

    std::thread::Builder::new()
        .name("visualizer".into())
        .spawn(move || {
            tracing::info!(target: VIS_TARGET, "visualizer thread started");
            let run = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let frame = frame_interval;
                let mut stream: Option<FFTStream> = None;
                let mut last_sub_nonzero = false;

                loop {
                    let tick = std::time::Instant::now();
                    let sub_count = subscribers.load(Ordering::Relaxed);

                    if sub_count == 0 {
                        if last_sub_nonzero {
                            tracing::info!(target: VIS_TARGET, "no subscribers — dropping FFTStream and pausing");
                            stream = None;
                            last_sub_nonzero = false;
                        }
                        std::thread::sleep(frame);
                        continue;
                    }
                    if !last_sub_nonzero {
                        tracing::info!(target: VIS_TARGET, sub_count, "subscriber(s) active — initialising FFTStream");
                        last_sub_nonzero = true;
                    }

                    // Check whether the default output device has changed.
                    let current_device = cpal::default_host()
                        .default_output_device()
                        .and_then(|d| d.name().ok());

                    let needs_reinit = match (&stream, &current_device) {
                        (None, _) => true,
                        (Some(s), Some(name)) => &s.device_name != name,
                        (Some(_), None) => true,
                    };

                    if needs_reinit {
                        if let Some(ref s) = stream {
                            tracing::info!(target: VIS_TARGET, old_device = %s.device_name, new_device = ?current_device, "output device changed — reinitialising FFTStream");
                        } else {
                            tracing::info!(target: VIS_TARGET, device = ?current_device, "creating FFTStream");
                        }
                        stream = None;
                        match FFTStream::new(4096) {
                            Ok(s) => {
                                tracing::info!(target: VIS_TARGET, device = %s.device_name, sample_rate = s.sample_rate, channels = s.channels, fft_size = s.fft_size, "FFTStream created");
                                stream = Some(s);
                            }
                            Err(err) => {
                                tracing::error!(target: VIS_TARGET, error = %err, "FFTStream init failed; will retry next frame");
                                std::thread::sleep(frame);
                                continue;
                            }
                        }
                    }

                    if let Some(ref mut s) = stream {
                        let buf_len = s.audio_buffer.len();
                        if buf_len > s.fft_size * 8 {
                            tracing::warn!(target: VIS_TARGET, buf_len, fft_size = s.fft_size, "audio_buffer unexpectedly large");
                        }
                        let data: Vec<FrequencyReading> = s.get();
                        let _ = app.emit(crate::events::STREAM_VISUALIZER, data);
                    }

                    // Sleep for the remainder of the frame budget.
                    let elapsed = tick.elapsed();
                    if elapsed < frame {
                        std::thread::sleep(frame - elapsed);
                    }
                }
            }));
            if let Err(panic_val) = run {
                let msg = panic_val
                    .downcast_ref::<&str>()
                    .copied()
                    .or_else(|| panic_val.downcast_ref::<String>().map(|s| s.as_str()))
                    .unwrap_or("<non-string panic payload>");
                tracing::error!(target: VIS_TARGET, panic = msg, "visualizer thread panicked — stream will be unavailable until restart");
            }
        })
        .expect("failed to spawn visualizer thread");
}
