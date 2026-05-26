use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use crate::AppState;
use tauri::{Emitter, Manager};
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
pub struct SystemStats {
    pub cpu: CpuStats,
    pub memory: MemoryStats,
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

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct TemperatureReading {
    pub label: String,
    pub current: f32,
    pub max: f32,
}

#[derive(serde::Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct HardwareStats {
    pub disks: Vec<DiskInfo>,
    pub networks: Vec<NetworkInterfaceInfo>,
    pub temperatures: Vec<TemperatureReading>,
}

fn collect_system_stats(sys: &sysinfo::System) -> SystemStats {
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

    SystemStats {
        cpu: CpuStats {
            global_usage: sys.global_cpu_usage(),
            processors: processors.into_values().collect(),
            total_physical_cores: num_cpus::get_physical(),
            total_logical_cores: num_cpus::get(),
        },
        memory: MemoryStats {
            used: sys.used_memory(),
            total: sys.total_memory(),
            swap_used: sys.used_swap(),
            swap_total: sys.total_swap(),
        },
    }
}

pub async fn run_system_loop(app: tauri::AppHandle, subscribers: Arc<AtomicUsize>, poll_interval: Duration) {
    const TARGET: &str = "system";
    tracing::info!(target: TARGET, "system loop started");
    let mut interval = tokio::time::interval(poll_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last_had_subs = false;
    loop {
        interval.tick().await;
        let sub_count = subscribers.load(Ordering::Relaxed);
        if sub_count == 0 {
            if last_had_subs {
                tracing::info!(target: TARGET, "no subscribers — pausing system updates");
                last_had_subs = false;
            }
            continue;
        }
        if !last_had_subs {
            tracing::info!(target: TARGET, sub_count, "subscriber(s) active — resuming system updates");
            last_had_subs = true;
        }
        let stats = {
            let state = app.state::<AppState>();
            let mut state = state.lock().await;
            state.system_info.refresh_cpu_all();
            state.system_info.refresh_memory();
            collect_system_stats(&state.system_info)
        };
        if let Ok(value) = serde_json::to_value(&stats) {
            app.state::<crate::ChannelCache>().set("system", value);
        }
        let _ = app.emit(crate::events::STREAM_SYSTEM, stats);
    }
}

fn collect_hardware_stats(
    disks: &sysinfo::Disks,
    networks: &sysinfo::Networks,
    components: &sysinfo::Components,
) -> HardwareStats {
    HardwareStats {
        disks: disks
            .iter()
            .map(|disk| DiskInfo {
                name: disk.name().to_string_lossy().to_string(),
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                file_system: disk.file_system().to_string_lossy().to_string(),
                kind: format!("{:?}", disk.kind()),
                total_space: disk.total_space(),
                available_space: disk.available_space(),
            })
            .collect(),
        networks: networks
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
            .collect(),
        temperatures: components
            .iter()
            .map(|comp| TemperatureReading {
                label: comp.label().to_string(),
                current: comp.temperature().unwrap_or(f32::NAN),
                max: comp.max().unwrap_or(f32::NAN),
            })
            .collect(),
    }
}

pub async fn run_hardware_loop(app: tauri::AppHandle, subscribers: Arc<AtomicUsize>, poll_interval: Duration) {
    const TARGET: &str = "hardware";
    tracing::info!(target: TARGET, "hardware loop started");
    let mut interval = tokio::time::interval(poll_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last_had_subs = false;
    loop {
        interval.tick().await;
        let sub_count = subscribers.load(Ordering::Relaxed);
        if sub_count == 0 {
            if last_had_subs {
                tracing::info!(target: TARGET, "no subscribers — pausing hardware updates");
                last_had_subs = false;
            }
            continue;
        }
        if !last_had_subs {
            tracing::info!(target: TARGET, sub_count, "subscriber(s) active — resuming hardware updates");
            last_had_subs = true;
        }
        let stats = {
            let state = app.state::<AppState>();
            let mut state = state.lock().await;
            state.disks.refresh(false);
            state.networks.refresh(false);
            state.components.refresh(false);
            collect_hardware_stats(&state.disks, &state.networks, &state.components)
        };
        if let Ok(value) = serde_json::to_value(&stats) {
            app.state::<crate::ChannelCache>().set("hardware", value);
        }
        let _ = app.emit(crate::events::STREAM_HARDWARE, stats);
    }
}
