use crate::AppState;
use tauri::Manager;

pub mod cpu {
    use std::collections::HashMap;

    use super::{AppState, Manager};

    #[derive(serde::Serialize)]
    pub struct Core {
        pub name: String,
        pub frequency: u64,
        pub usage: f32,
    }

    #[derive(serde::Serialize)]
    pub struct Processor {
        pub brand: String,
        pub cores: Vec<Core>,
    }

    #[derive(serde::Serialize)]
    pub struct Processors {
        processors: Vec<Processor>,
        total_physical_cores: usize,
        total_logical_cores: usize,
    }

    #[tauri::command]
    pub async fn get_processors(app: tauri::AppHandle) -> Result<Processors, String> {
        let state = app.state::<AppState>();
        let mut state = state.lock().await;
        state.system_info.refresh_cpu_all();
        let mut cores = HashMap::new();
        for cpu in state.system_info.cpus() {
            let entry = cores
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

        Ok(Processors {
            processors: cores.into_values().collect(),
            total_physical_cores: num_cpus::get_physical(),
            total_logical_cores: num_cpus::get(),
        })
    }

    #[tauri::command]
    pub async fn get_cpu_usage(app: tauri::AppHandle) -> Result<f32, String> {
        let state = app.state::<AppState>();
        let mut state = state.lock().await;
        state.system_info.refresh_cpu_usage();
        Ok(state.system_info.global_cpu_usage())
    }
}
pub mod memory {
    use super::{AppState, Manager};

    #[tauri::command]
    pub async fn get_memory_usage(app: tauri::AppHandle) -> Result<(u64, u64), String> {
        let state = app.state::<AppState>();
        let mut state = state.lock().await;
        state.system_info.refresh_memory();
        Ok((
            state.system_info.used_memory(),
            state.system_info.total_memory(),
        ))
    }

    #[tauri::command]
    pub async fn get_swap_usage(app: tauri::AppHandle) -> Result<(u64, u64), String> {
        let state = app.state::<AppState>();
        let mut state = state.lock().await;
        state.system_info.refresh_memory();
        Ok((
            state.system_info.used_swap(),
            state.system_info.total_swap(),
        ))
    }
}

pub mod disk {
    use super::{AppState, Manager};

    #[derive(serde::Serialize)]
    pub struct DiskDetails {
        pub name: String,
        pub mount_point: String,
        pub file_system: String,
        pub kind: String,
        pub total_space: u64,
        pub available_space: u64,
    }

    #[tauri::command]
    pub async fn get_disk_details(app: tauri::AppHandle) -> Result<Vec<DiskDetails>, String> {
        let state = app.state::<AppState>();
        let mut state = state.lock().await;
        state.disks.refresh(true);
        Ok(state
            .disks
            .iter()
            .map(|disk| DiskDetails {
                name: disk.name().to_string_lossy().to_string(),
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                file_system: disk.file_system().to_string_lossy().to_string(),
                kind: format!("{:?}", disk.kind()),
                total_space: disk.total_space(),
                available_space: disk.available_space(),
            })
            .collect())
    }
}

pub mod temperature {
    use super::{AppState, Manager};

    #[derive(serde::Serialize)]
    pub struct Temperature {
        pub id: String,
        pub label: String,
        pub current: f32,
        pub max: f32,
    }

    #[tauri::command]
    pub async fn get_temperatures(app: tauri::AppHandle) -> Result<Vec<Temperature>, String> {
        let state = app.state::<AppState>();
        let mut state = state.lock().await;
        state.components.refresh(true);
        Ok(state
            .components
            .iter()
            .map(|comp| Temperature {
                id: comp.id().unwrap_or("Unknown").to_string(),
                label: comp.label().to_string(),
                current: comp.temperature().unwrap_or(f32::NAN),
                max: comp.max().unwrap_or(f32::NAN),
            })
            .collect())
    }
}

pub mod network {
    use super::{AppState, Manager};

    #[derive(serde::Serialize)]
    pub struct NetworkInterface {
        pub name: String,
        pub received: u64,
        pub transmitted: u64,
        pub mtu: u64,
        pub mac_address: String,
    }

    #[tauri::command]
    pub async fn get_network_interfaces(
        app: tauri::AppHandle,
    ) -> Result<Vec<NetworkInterface>, String> {
        let state = app.state::<AppState>();
        let mut state = state.lock().await;
        state.networks.refresh(false);
        Ok(state
            .networks
            .iter()
            .filter_map(|(name, data)| {
                let mac_address = data.mac_address();
                if mac_address.is_unspecified() {
                    None
                } else {
                    Some(NetworkInterface {
                        name: name.clone(),
                        received: data.received(),
                        transmitted: data.transmitted(),
                        mtu: data.mtu(),
                        mac_address: mac_address.to_string(),
                    })
                }
            })
            .collect())
    }
}
