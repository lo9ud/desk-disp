# cpal 0.16.0 WASAPI Loopback Crash Investigation

**Status:** Fix applied; original crash location not yet confirmed  
**Fix applied:** `cpal = { version = "0.16.0", features = ["audio_thread_priority"] }` in `src-tauri/Cargo.toml`  
**Symptom:** `STATUS_FATAL_APP_EXIT` (0xC0000421) on visualizer initialisation; no Rust panic hook output; crash occurred ~130 ms after stream init, not immediately

---

## Background

The desk-disp visualizer widget subscribes to a `stream::visualizer` channel, which triggers `FFTStream::new()` in `src-tauri/src/media/mod.rs`. This builds a WASAPI loopback capture stream via cpal (`build_input_stream` on the default output device with `AUDCLNT_STREAMFLAGS_LOOPBACK`), spawns a background thread to run the FFT loop, and emits frequency data as Tauri events.

On first initialisation the entire process aborted with `STATUS_FATAL_APP_EXIT`. The Rust panic hook did not fire (`[PANIC]` never appeared on stderr or in the log), ruling out a normal Rust unwind; this is a native abort or a Windows structured exception that bypassed the Rust runtime.

---

## Confirmed Bug (causal relationship to crash unverified)

### cpal 0.16.0 — thread ID cast as kernel HANDLE in `boost_current_thread_priority`

**File:** `cpal-0.16.0/src/host/wasapi/stream.rs`, lines 346–358 (no-feature build path)

```rust
#[cfg(not(feature = "audio_thread_priority"))]
fn boost_current_thread_priority(_: BufferSize, _: crate::SampleRate) {
    use windows::Win32::Foundation::HANDLE;
    unsafe {
        let thread_id = Threading::GetCurrentThreadId(); // returns u32 numeric ID
        let _ = Threading::SetThreadPriority(
            HANDLE(thread_id as isize),                 // BUG: not a handle
            Threading::THREAD_PRIORITY_TIME_CRITICAL,
        );
    }
}
```

`GetCurrentThreadId()` returns a numeric thread identifier (`u32`). `SetThreadPriority` requires a kernel object `HANDLE` — a process-local index into the handle table. These are completely different things. The pseudo-handle for the current thread is `GetCurrentThread()` (returns `HANDLE(-2)`), not the thread ID.

**Diagnosed via:** WinDbg + Application Verifier (Handles layer). The Handles layer intercepted the `SetThreadPriority` call inside `vfbasics!AVrfpNtSetInformationThread`, observed that `HANDLE(thread_id)` was not a valid thread object handle, and raised `STATUS_INVALID_HANDLE` immediately. The full stack at that point:

```
ntdll!NtRaiseException
vfbasics!AVrfpNtSetInformationThread
KERNELBASE!SetThreadPriority
cpal::host::wasapi::stream::boost_current_thread_priority
cpal::host::wasapi::stream::run_input
std::sys::pal::windows::thread::Thread::new::thread_start
```

**Fix:** Enable the `audio_thread_priority` cpal feature, which routes through the `audio_thread_priority` crate's `promote_current_thread_to_real_time`. This correctly calls MMCSS (`AvSetMmThreadCharacteristics`) and handles failure gracefully rather than calling `SetThreadPriority` with a raw ID.

```toml
# src-tauri/Cargo.toml
cpal = { version = "0.16.0", features = ["audio_thread_priority"] }
```

Post-fix log confirms correct behaviour:
```
[INFO] [log] task 582 bumped to real time priority.
```

---

## Critical Caveats

### 1. App Verifier distorted the crash location

**The stack trace above is NOT the original crash location.** App Verifier's Handles layer made the invalid handle use immediately fatal by injecting `AVrfpNtSetInformationThread` into the `SetThreadPriority` code path. Without App Verifier:

- `SetThreadPriority` with an invalid handle simply returns `FALSE`
- cpal's `let _ =` discards the return value silently
- The audio thread continues at normal (non-real-time) priority
- The process crashed ~130 ms later at an **unknown, unrecorded location**

### 2. The fix is confounded — the bug and the crash may be unrelated

Enabling `features = ["audio_thread_priority"]` makes **two independent changes in a single diff**:

| Change | Effect |
| --- | --- |
| Removes `HANDLE(thread_id as isize)` call | Eliminates the invalid handle use caught by App Verifier |
| Routes through `promote_current_thread_to_real_time` (MMCSS) | Actually promotes the thread to real-time priority — something the broken path was silently failing to do |

The crash is gone, but we cannot determine from the fix alone whether the crash was caused by:

- **(A)** The invalid handle call itself — some Windows-internal side effect not visible without App Verifier (e.g., coincidental handle table collision, scheduler state corruption)
- **(B)** The thread genuinely running at normal priority — the broken `SetThreadPriority` call failed silently, the thread ran without real-time priority, and some downstream WASAPI timing failure, QPC arithmetic overflow, or race condition caused the abort 130 ms later
- **(C)** An unrelated third cause that the change happened to fix by altering timing or scheduling behaviour

The App Verifier trace proves the bug **exists**. It does not prove the bug **caused the crash**. The true causal chain requires the original crash stack — which was never captured (see further steps).

---

## Minimal Reproducible Example

Reproduces the invalid handle call in isolation. Requires Windows, cpal 0.16.0, **no** `audio_thread_priority` feature, and any audio output device present.

### `Cargo.toml`

```toml
[package]
name = "cpal-repro"
version = "0.1.0"
edition = "2021"

[dependencies]
# Deliberately omit audio_thread_priority feature to trigger the bug
cpal = "0.16.0"
```

### `src/main.rs`

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

fn main() {
    let host = cpal::default_host();

    // Use the default output device — loopback capture requires an output device
    let device = host
        .default_output_device()
        .expect("no output device available");

    println!("Device: {}", device.name().unwrap_or_default());

    let config = device
        .default_output_config()
        .expect("could not get default output config");

    println!("Config: {:?}", config);

    // Build a loopback capture stream. The AUDCLNT_STREAMFLAGS_LOOPBACK flag is set
    // internally by cpal when build_input_stream is called on an output device.
    // The spawned audio thread will call boost_current_thread_priority immediately,
    // passing HANDLE(GetCurrentThreadId() as isize) to SetThreadPriority.
    let stream = device
        .build_input_stream(
            &config.into(),
            |data: &[f32], _info: &cpal::InputCallbackInfo| {
                // With the bug present this callback may never fire
                println!("data callback: {} samples", data.len());
            },
            |err| {
                // Log the HRESULT to see if WASAPI returns an error downstream
                eprintln!("stream error: {err}");
            },
            None,
        )
        .expect("failed to build input stream");

    stream.play().expect("failed to play stream");

    // Keep alive long enough to observe the crash timeline
    std::thread::sleep(std::time::Duration::from_secs(2));

    println!("exited cleanly");
}
```

### Expected behaviour with bug present

- With **App Verifier Handles layer**: process aborts immediately inside `boost_current_thread_priority` on stream creation. WinDbg stack shows `AVrfpNtSetInformationThread` → `SetThreadPriority` → `boost_current_thread_priority`.
- **Without App Verifier**: `SetThreadPriority` returns `FALSE` silently. Data callback output depends on whether audio is playing on the system. Process may abort after a delay at a location yet to be confirmed (see open questions).

### Expected behaviour with fix

Enable the feature and the crash does not occur:
```toml
cpal = { version = "0.16.0", features = ["audio_thread_priority"] }
```

---

## Avenues Investigated

### Ruled out

**COM/WASAPI thread safety — data crossing COM-managed thread boundaries**  
Proposed: mpsc channel transferring audio data between cpal's COM-initialised audio thread and our Rust FFT thread might violate COM apartment rules.  
Ruled out: cpal initialises COM per-thread with `CoInitializeEx(COINIT_APARTMENTTHREADED)` before any COM calls. The data transferred over the mpsc channel is plain `Vec<f32>` — no COM interface pointers, no `IUnknown` references. COM apartment rules do not apply to plain memory. The mpsc channel itself is a Rust-managed object, not a COM object.

**Persistent error state from `SetThreadPriority` failure**  
Proposed: the failed kernel call might leave error state that corrupts subsequent WASAPI calls.  
Ruled out: `SetThreadPriority` is a pure lookup-and-write. If the handle is invalid the kernel lookup fails immediately, nothing is written, no state is changed. The only "state" produced is `GetLastError()` in the calling thread's TEB, which cpal never reads (the result is discarded with `let _ =`).

**Same ID/handle conflation elsewhere in cpal wasapi**  
Proposed: other parts of the wasapi backend might perform the same `HANDLE(thread_id as isize)` cast.  
Ruled out: searched all four source files in `cpal-0.16.0/src/host/wasapi/` (`com.rs`, `device.rs`, `mod.rs`, `stream.rs`). The conflation exists in exactly one location — the no-feature `boost_current_thread_priority`.

**Stack overflow from audio buffer accumulation**  
Proposed: if the FFT consumer loop is slower than the audio producer, data accumulates and eventually overflows the stack.  
Ruled out: the mpsc channel used is `std::sync::mpsc::channel()` — unbounded, heap-allocated. Accumulation grows heap memory, not the stack. The `run_input` loop is flat and iterative (no recursion); stack depth is bounded and constant. Stack overflow via this path is not possible.

**Recursive error callback**  
Proposed: a WASAPI error fires `error_callback`, which triggers some action that produces another error, re-entering the callback.  
Ruled out: the `error_callback` in our code is a simple tracing closure with no side effects. cpal's `process_input` and `process_commands_and_await_signal` call `error_callback` and then immediately return `ControlFlow::Break` — execution never re-enters the loop after an error callback fires.

---

### Left open

**Actual crash location without App Verifier**  
The confirmed bug (`boost_current_thread_priority`) is the root cause, but without App Verifier the `SetThreadPriority` call fails silently and the process crashes ~130 ms later at an unknown location. We have no stack trace for this path. The App Verifier stack trace is the injected-failure location, not the natural failure point.  
Status: **unresolved** — requires a crash dump captured without App Verifier active (see further steps).

**WASAPI buffer deadline miss → downstream HRESULT error**  
Proposed: the audio thread running at normal (non-real-time) priority misses WASAPI's buffer period deadlines (~10 ms), causing `GetNextPacketSize` or `GetBuffer` to return an error code such as `AUDCLNT_E_BUFFER_ERROR`, firing `error_callback` and breaking the capture loop.  
Evidence against: the `error_callback` was confirmed to never fire during the crash run. All error paths in `process_input` and `process_commands_and_await_signal` route through `error_callback`; if it did not fire, this path was not taken.  
Status: **open but weakened** — does not explain the observed behaviour; cannot be fully ruled out without the original crash stack.

**`join().unwrap()` panic propagation on audio thread exit**  
`Stream::Drop` contains:
```rust
self.thread.take().unwrap().join().unwrap();
```
If the audio thread exits via a panic (not a clean `ControlFlow::Break`), `join()` returns `Err(panic_payload)` and `.unwrap()` re-panics on the dropping thread. If the `Stream` is dropped from a thread that is not the Rust main thread or that has no panic handler at the top of its stack, the runtime calls `abort()`, producing `STATUS_FATAL_APP_EXIT`.  
Status: **open** — plausible mechanism for the secondary crash. Requires the original crash stack to confirm or rule out.

**QPC timestamp arithmetic panic on first packet**  
`process_input` converts the WASAPI `qpc_position` value to a `StreamInstant` via arithmetic that uses `.expect()` at lines 541, 557, and 581 of `stream.rs`. If WASAPI returns an unexpected QPC value (zero, very large, or the audio clock is not yet running) on the first captured packet, the `.expect()` panics inside the audio thread. This would then propagate through `join().unwrap()` as described above.  
Status: **open** — specific to the timing of first packet delivery; would explain the ~130 ms delay (first packet arrives after a few buffer periods). Requires the original crash stack to confirm.

**Thread ID coincidentally matching a valid handle**  
Thread IDs and process handle table indices are both small positive integers. With low but non-zero probability, `HANDLE(thread_id as isize)` might coincide with an actual open handle in the process (a file, event, mutex, etc.). `SetThreadPriority` would check that the handle refers to a Thread object, fail with `ERROR_INVALID_HANDLE`, and return `FALSE`. However, the kernel's handle table lookup itself may briefly touch the object associated with that handle. If the coincidental handle is one of the WASAPI event handles (`stream.event` or `pending_scheduled_event`), internal reference counting side effects are possible.  
Status: **open but low probability** — would require knowing the thread ID value and the process handle table at the time of the crash to confirm or rule out. Very unlikely to be the primary mechanism.

---

## Further Steps Required

### 1. Obtain the pre-App-Verifier crash stack (highest priority)

This is required to confirm the actual crash mechanism and close the open questions above.

**Option A — Check existing dumps**

WER was already configured to write full dumps to `C:\crashes` before App Verifier was involved. Check for any dump predating the fix:

```powershell
Get-ChildItem C:\crashes -Filter "desk-disp*.dmp" | Sort-Object LastWriteTime | Format-Table Name, LastWriteTime, Length
```

If a pre-fix dump exists, open it in WinDbg:
```
File → Open Crash Dump → select the .dmp
.symfix
.sympath+ C:\Users\adamd\Projects\desktop-disp\target\debug
.reload /f
!analyze -v
.ecxr
kb 50
~*kb 30
```

**Option B — Reproduce without App Verifier**

If no pre-fix dump exists:

1. Temporarily revert the fix: change `Cargo.toml` back to `cpal = "0.16.0"` (no feature)
2. Disable only the Handles layer in App Verifier (keep Heaps active for heap corruption detection):
   ```cmd
   appverif.exe -disable Handles -for desk-disp.exe
   ```
3. Build a debug binary and run until crash; WER will write a dump to `C:\crashes`
4. Re-enable the fix immediately after

**What to look for in the dump:**

| Stack contains | Implication |
| --- | --- |
| `.expect` / `unwrap` inside `input_timestamp` (stream.rs ~540) | QPC overflow on first packet — confirms hypothesis |
| `ntdll!RtlFailFast` after `join().unwrap()` | Audio thread panic propagated through drop |
| `ntdll!RtlHeapFree` + heap corruption marker | Heap corruption — App Verifier Heaps layer would have caught this first |
| Pure WASAPI / `AudioSes.dll` frames, no Rust | Exception inside Windows audio engine, not cpal |

### 2. File the cpal bug report

A full bug report was drafted during this investigation. It should include:

- The exact code path with line numbers from `cpal-0.16.0/src/host/wasapi/stream.rs`
- The App Verifier / WinDbg stack trace
- The distinction between `GetCurrentThreadId()` and `GetCurrentThread()` with MSDN links
- The `audio_thread_priority` feature as the fix
- A note that the no-feature fallback is silent on failure, masking the bug without a debugger
- The MRE from this document

Reference: [cpal GitHub issues](https://github.com/RustAudio/cpal/issues)

### 3. Confirm fix behaviour on machines without MMCSS

The `audio_thread_priority` crate uses MMCSS (`AvSetMmThreadCharacteristics("Pro Audio", ...)`) for real-time promotion. MMCSS is available on all Windows editions since Vista, but some restricted environments (certain VMs, Windows sandbox, LTSC builds) may have the MMCSS service disabled. The `audio_thread_priority` crate handles this gracefully (logs a warning, continues at normal priority) — confirm this does not reintroduce the crash on those targets.

### 4. Resolve FFTStream subscribe/unsubscribe thrashing

Tracked in `TODO.md`. Edit-mode transitions unmount and remount the visualizer widget, firing rapid unsubscribe + subscribe cycles. Each cycle tears down and recreates the WASAPI loopback stream and audio thread. Confirm:

- Old stream and WASAPI event handles are fully closed before the new stream opens
- No handle leak across cycles (App Verifier Handles layer will catch this)
- Consider a short grace-period cache on the live `FFTStream` to avoid unnecessary teardown

### 5. Upgrade cpal (optional, deferred)

The `master` branch of cpal has refactored `boost_current_thread_priority`. Evaluate whether upgrading from 0.16.0 resolves the underlying issue at the source and whether the API surface is compatible with the existing loopback stream setup.

---

## Reference

| Item | Value |
| --- | --- |
| cpal version affected | 0.16.0 |
| Bug location | `src/host/wasapi/stream.rs`, `boost_current_thread_priority`, `#[cfg(not(feature = "audio_thread_priority"))]` |
| Windows API misused | `SetThreadPriority(HANDLE(GetCurrentThreadId() as isize), ...)` |
| Correct API | `SetThreadPriority(GetCurrentThread(), ...)` or `audio_thread_priority::promote_current_thread_to_real_time` |
| Fix | `cpal = { version = "0.16.0", features = ["audio_thread_priority"] }` |
| Diagnosis tool | Windows Application Verifier (Handles layer) + WinDbg |
| Symptom | `STATUS_FATAL_APP_EXIT` (0xC0000421) ~130 ms after stream init |
| Original crash location | Unknown — distorted by App Verifier; requires pre-fix crash dump |
