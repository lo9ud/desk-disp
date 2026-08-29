use crate::events::{emit_stream, StreamGate, StreamHints, StreamName};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use ts_rs::TS;

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct Core {
    pub name: String,
    pub frequency: u64,
    pub usage: f32,
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct Processor {
    pub brand: String,
    pub cores: Vec<Core>,
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct CpuStats {
    pub global_usage: f32,
    pub processors: Vec<Processor>,
    pub total_physical_cores: usize,
    pub total_logical_cores: usize,
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct MemoryStats {
    pub used: u64,
    pub total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub kind: String,
    pub total_space: u64,
    pub available_space: u64,
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct NetworkInterfaceInfo {
    pub name: String,
    pub received: u64,
    pub transmitted: u64,
    pub total_received: u64,
    pub total_transmitted: u64,
    pub mac_address: String,
}

fn collect_cpu_stats(sys: &sysinfo::System) -> CpuStats {
    let mut processors: HashMap<String, Processor> = HashMap::new();
    for cpu in sys.cpus() {
        let entry = processors
            .entry(cpu.brand().to_string())
            .or_insert_with(|| Processor {
                brand: cpu.brand().trim().to_string(),
                cores: Vec::new(),
            });
        entry.cores.push(Core {
            name: cpu.name().to_string(),
            frequency: cpu.frequency(),
            usage: cpu.cpu_usage(),
        });
    }

    CpuStats {
        global_usage: sys.global_cpu_usage(),
        processors: processors.into_values().collect(),
        total_physical_cores: num_cpus::get_physical(),
        total_logical_cores: num_cpus::get(),
    }
}

fn collect_memory_stats(sys: &sysinfo::System) -> MemoryStats {
    MemoryStats {
        used: sys.used_memory(),
        total: sys.total_memory(),
        swap_used: sys.used_swap(),
        swap_total: sys.total_swap(),
    }
}

fn collect_disk_stats(disks: &sysinfo::Disks) -> Vec<DiskInfo> {
    disks
        .iter()
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().to_string(),
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            file_system: disk.file_system().to_string_lossy().to_string(),
            kind: format!("{:?}", disk.kind()),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
        })
        .collect()
}

fn collect_network_stats(networks: &sysinfo::Networks) -> Vec<NetworkInterfaceInfo> {
    networks
        .iter()
        .filter_map(|(name, data)| {
            let mac = data.mac_address();
            if mac.is_unspecified() {
                return None;
            }
            Some(NetworkInterfaceInfo {
                name: name.clone(),
                received: data.received(),
                transmitted: data.transmitted(),
                total_received: data.total_received(),
                total_transmitted: data.total_transmitted(),
                mac_address: mac.to_string(),
            })
        })
        .collect()
}

/// `sysinfo` handles for the cpu/memory/disks/networks metrics, owned entirely by
/// `run_resource_loop`'s task — confirmed (full-crate grep) that nothing outside this module
/// ever touches them, so unlike the rest of `AppStateInner` they need no shared mutex at all.
struct ResourceState {
    system: sysinfo::System,
    disks: sysinfo::Disks,
    networks: sysinfo::Networks,
}

impl ResourceState {
    fn new() -> Self {
        Self {
            system: sysinfo::System::new_with_specifics(
                sysinfo::RefreshKind::nothing()
                    .with_cpu(sysinfo::CpuRefreshKind::everything())
                    .with_memory(sysinfo::MemoryRefreshKind::everything()),
            ),
            disks: sysinfo::Disks::new_with_refreshed_list(),
            networks: sysinfo::Networks::new_with_refreshed_list(),
        }
    }
}

/// Consolidates what used to be `run_system_loop` (cpu+memory) and `run_hardware_loop`
/// (disks+networks) into one task: a `tokio::select!` over 4 independent per-metric intervals,
/// so cadences can diverge later without another refactor, while cutting 2 tokio tasks down to
/// 1. Only one `select!` arm's body ever executes per loop iteration, so plain field access on
/// the task-owned `ResourceState` needs no interior mutability.
pub async fn run_resource_loop(
    app: tauri::AppHandle,
    hints: Arc<StreamHints>,
    poll_interval: Duration,
) {
    tracing::info!(target: "resource", "resource loop started");

    let mut state = ResourceState::new();

    let mut cpu_interval = tokio::time::interval(poll_interval);
    let mut memory_interval = tokio::time::interval(poll_interval);
    let mut disks_interval = tokio::time::interval(poll_interval);
    let mut networks_interval = tokio::time::interval(poll_interval);
    for iv in [
        &mut cpu_interval,
        &mut memory_interval,
        &mut disks_interval,
        &mut networks_interval,
    ] {
        iv.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    }

    let mut cpu_gate = StreamGate::new(Arc::clone(&hints), StreamName::Cpu);
    let mut memory_gate = StreamGate::new(Arc::clone(&hints), StreamName::Memory);
    let mut disks_gate = StreamGate::new(Arc::clone(&hints), StreamName::Disks);
    let mut networks_gate = StreamGate::new(hints, StreamName::Networks);

    loop {
        tokio::select! {
            _ = cpu_interval.tick() => {
                if cpu_gate.should_run() {
                    state.system.refresh_cpu_all();
                    emit_stream(&app, StreamName::Cpu, collect_cpu_stats(&state.system));
                }
            }
            _ = memory_interval.tick() => {
                if memory_gate.should_run() {
                    state.system.refresh_memory();
                    emit_stream(&app, StreamName::Memory, collect_memory_stats(&state.system));
                }
            }
            _ = disks_interval.tick() => {
                if disks_gate.should_run() {
                    state.disks.refresh(false);
                    emit_stream(&app, StreamName::Disks, collect_disk_stats(&state.disks));
                }
            }
            _ = networks_interval.tick() => {
                if networks_gate.should_run() {
                    state.networks.refresh(false);
                    emit_stream(&app, StreamName::Networks, collect_network_stats(&state.networks));
                }
            }
        }
    }
}
