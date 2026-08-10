# sysinfo 0.37.0 — BSTR double-free in `windows::component::Connection::connect_server`

**Status:** Root cause confirmed via Application Verifier + WinDbg. Fix identified (one-line
removal). Not yet filed upstream or independently reproduced outside this repo.

**Symptom:** `APPLICATION_VERIFIER_HEAPS_FIRST_CHANCE_ACCESS_VIOLATION` (`STATUS_VERIFIER_STOP`,
`0xC0000421`) inside `oleaut32!SysFreeString`, with Application Verifier's Heaps layer reporting
the target address as an already-freed allocation.

---

## Environment

| Item | Value |
| --- | --- |
| `sysinfo` | 0.37.0 |
| `windows` (sysinfo's dependency) | 0.61.3 |
| `windows-core` | 0.61.2 |
| `rustc` | 1.89.0 (2025-08-04) |
| OS | Windows 11, build 10.0.26200.8875 |
| Diagnosis tool | Application Verifier (Heaps layer, Page Heap) + WinDbg, live-attached |

---

## Root cause

`src/windows/component.rs`, `Connection::connect_server` (lines 215–235):

```rust
fn connect_server(mut self) -> Option<Connection> {
    let instance = self.instance.as_ref()?;
    let svc = unsafe {
        let s = bstr!("root\\WMI");                    // line 218 — SysAllocString, s: BSTR owns the string
        let res = instance.ConnectServer(
            &s,                                          // passed by reference — ConnectServer does not take ownership
            &Default::default(),
            &Default::default(),
            &Default::default(),
            0,
            &Default::default(),
            None,
        );
        SysFreeString(&s);                              // line 228 — free #1 (manual)
        res
    }
    .ok()?;
    // `s` goes out of scope here at the end of the unsafe block → BSTR::drop() → free #2

    self.server_connection = Some(svc);
    Some(self)
}
```

`s` is a `windows_core::BSTR`, created via the local `bstr!` macro (line 138–140):

```rust
macro_rules! bstr {
    ($x:literal) => {{ SysAllocString(w!($x)) }};
}
```

`windows_core::BSTR` owns its underlying string and frees it on `Drop`:

```rust
impl Drop for BSTR {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { bindings::SysFreeString(self.0) }
        }
    }
}
```

`IWbemLocator::ConnectServer` takes `strnetworkresource: &windows_core::BSTR` — a borrow, not an
owned value. The generated binding only `transmute_copy`s the raw pointer out for the FFI call; it
never takes ownership or nulls out the caller's `BSTR`. So `s` is untouched by the `ConnectServer`
call and still owns the string when the explicit `SysFreeString(&s)` on line 228 runs — that's the
first free. `s` is never set to null afterward, so when it drops at the end of the `unsafe` block,
`BSTR::drop` calls `SysFreeString` a second time on the same, now-dangling pointer.

This is an **unconditional double-free** — it happens on every call to `connect_server`, on every
machine, regardless of host application. `connect_server` is called from `ComponentInner::new()`
(first component read) and from `ComponentInner::refresh()` whenever the connection was dropped
and needs to be re-established (lines 74–77) — i.e. it's on the normal, expected path for the
`component` feature on Windows, not an edge case.

The four `&Default::default()` arguments elsewhere in the same call are harmless: `BSTR::default()`
constructs a null-pointer `BSTR` (`BSTR::new()`, `Self(core::ptr::null_mut())`), and `Drop` no-ops
on a null pointer.

---

## How we found it

Caught live under Application Verifier (Heaps layer / Page Heap) with WinDbg attached at process
launch (`windbg desk-disp.exe --dev`, `g` to run past the loader breakpoint). First-chance
exception:

```
VERIFIER STOP 0000000000000013: pid 0x2FF8: First chance access violation for current stack trace.

    000001E6BC17B004 : Invalid address causing the exception.
    00007FF866D4748E : Code address executing the invalid access.
    000000BA9837EB70 : Exception record.
    000000BA9837E680 : Context record.

APPLICATION_VERIFIER_HEAPS_FIRST_CHANCE_ACCESS_VIOLATION (13)
First chance access violation for current stack trace.
...
Arg1: 000001e6bc17b004, Invalid address causing the exception.
Arg2: 00007ff866d4748e, Code address executing the invalid access.
```

`!heap -p -a 000001e6bc17b004` resolved the address to an **already-freed** allocation and gave
the stack of the free attempt that tripped the guard page:

```
address 000001e6bc17b004 found in
    _DPH_HEAP_ROOT @ 1e6ab3a1000
    in free-ed allocation (  DPH_HEAP_BLOCK:         VirtAddr         VirtSize)
                                1e6ba61b680:      1e6bc17a000             2000
    ntdll!RtlDebugFreeHeap+0x37
    ntdll!RtlpFreeHeap+0xb9
    ntdll!RtlFreeHeap+0x620
    vrfcore!VfCoreRtlFreeHeap+0x2c
    vfbasics!AVrfpRtlFreeHeap+0x11f
    oleaut32!APP_DATA::FreeCachedMem+0xd5
    oleaut32!SysFreeString+0x59
    desk_disp!windows::Win32::Foundation::SysFreeString+0x1e   [windows-0.61.3\src\Windows\Win32\Foundation\mod.rs @ 89]
    desk_disp!sysinfo::windows::component::Connection::connect_server+0x1b5  [sysinfo-0.37.0\src\windows\component.rs @ 228]
    desk_disp!sysinfo::windows::component::impl$0::new::closure$1+0x11       [sysinfo-0.37.0\src\windows\component.rs @ 37]
    desk_disp!enum2$<Option<Connection>>::and_then<...>+0x69                 [core\src\option.rs @ 1509]
    desk_disp!sysinfo::windows::component::ComponentInner::new+0x4d          [sysinfo-0.37.0\src\windows\component.rs @ 38]
    desk_disp!sysinfo::windows::component::ComponentsInner::refresh+0x68     [sysinfo-0.37.0\src\windows\component.rs @ 124]
    desk_disp!sysinfo::common::component::Components::refresh+0x1e           [sysinfo-0.37.0\src\common\component.rs @ 148]
    desk_disp!sysinfo::common::component::Components::new_with_refreshed_list+0x32 [sysinfo-0.37.0\src\common\component.rs @ 105]
```

The crashing frame (`component.rs @ 228`) is the explicit `SysFreeString(&s)` call itself — i.e.
Page Heap caught *this* call freeing a block it already believed was free, meaning an earlier free
of the same pointer had already landed by this point. That's consistent with the double-free
described above (the ordering of "which SysFreeString call Page Heap flags" can vary — see note
below on why this doesn't always crash — but there are only ever two candidates for the double
free: this line, and `BSTR::drop`, and no third call frees this pointer).

---

## Suggested fix

Delete the manual free; `BSTR`'s own `Drop` already owns cleanup:

```diff
     fn connect_server(mut self) -> Option<Connection> {
         let instance = self.instance.as_ref()?;
         let svc = unsafe {
             let s = bstr!("root\\WMI");
             let res = instance.ConnectServer(
                 &s,
                 &Default::default(),
                 &Default::default(),
                 &Default::default(),
                 0,
                 &Default::default(),
                 None,
             );
-            SysFreeString(&s);
             res
         }
         .ok()?;
```

No other change needed — `s` continues to own the string for its natural scope and frees it
exactly once, on drop.

---

## Why this doesn't crash on every run without Application Verifier

Without Page Heap, a double-free doesn't reliably crash — plain `HeapFree` (and oleaut32's own
`APP_DATA` BSTR cache, visible in the stack above as `FreeCachedMem`) can silently tolerate or
absorb a redundant free depending on incidental process state (what else has touched the OLE
Automation per-apartment string cache before this call runs). That's almost certainly also why
this only became *visible* in this project after reordering `sysinfo::Components::new_with_refreshed_list()`
to run earlier during app startup (before any COM-heavy WebView2 activity had touched that cache) —
the double free itself is unconditional and was always happening on every call to
`connect_server`, on every machine; what changed was only whether Page Heap's guard page happened
to still be "live" for that block at the moment of the second free, versus the free being quietly
absorbed by oleaut32's own bookkeeping first.

Practical implication for reproducing this upstream: a **minimal** standalone repro (little to no
other COM/BSTR traffic in the process before the call) is plausibly *more* likely to trip Page Heap
reliably than reproducing inside a full host application — the opposite of what you'd normally
expect. This has not been independently verified outside this repo yet.

---

## Minimal reproduction (proposed, not yet independently verified)

```toml
# Cargo.toml
[package]
name = "sysinfo-component-repro"
version = "0.1.0"
edition = "2021"

[dependencies]
sysinfo = "0.37.0"
```

```rust
// src/main.rs
fn main() {
    let components = sysinfo::Components::new_with_refreshed_list();
    println!("{} component(s) found", components.len());
}
```

Build, then register the resulting exe with Application Verifier's Heaps layer (elevated):

```
appverif -enable Heaps -for sysinfo-component-repro.exe
sysinfo-component-repro.exe
```

Expected: `APPLICATION_VERIFIER_HEAPS_FIRST_CHANCE_ACCESS_VIOLATION` inside
`oleaut32!SysFreeString`, same as above, if a debugger is attached at launch (`windbg -g
sysinfo-component-repro.exe`) — without an attached debugger the process will fail-fast-terminate
with `STATUS_VERIFIER_STOP` (`0xC0000421`) and no diagnostic output, so a debugger must be attached
to see the break-in.

---

## Workaround applied in this repo

The `component` Cargo feature is disabled entirely (`default-features = false`, feature list
excludes `component`) — this drops `windows/Win32_System_Wmi` and friends from the build, so the
buggy code path can't be linked in at all. Temperature/component readings are stubbed to an empty
list on our side until this is fixed upstream. See `src-tauri/Cargo.toml` and
`src-tauri/src/system/mod.rs`.

---

## Reference

| Item | Value |
| --- | --- |
| Crate | sysinfo |
| Version affected | 0.37.0 (likely earlier/later 0.3x too — not checked) |
| Bug location | `src/windows/component.rs`, `Connection::connect_server`, line 228 |
| Fix | Delete the manual `SysFreeString(&s);` call — `BSTR::drop` already frees it |
| Diagnosis tool | Application Verifier (Heaps layer) + WinDbg, live-attached |
| Symptom | `STATUS_VERIFIER_STOP` / `APPLICATION_VERIFIER_HEAPS_FIRST_CHANCE_ACCESS_VIOLATION` inside `oleaut32!SysFreeString` |
| Upstream issue | not yet filed |
