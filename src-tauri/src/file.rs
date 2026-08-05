#![allow(dead_code)]
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{format, fs::File, path::{Path, PathBuf}};
use tauri::Manager;

use crate::{
    config::{app_cache_dir, app_data_dir},
    AppState,
};

pub struct FileManager {
    data: PathBuf,
    cache: PathBuf,
}

#[derive(Serialize, Deserialize, ts_rs::TS, Clone, Debug, PartialEq, Eq, Hash)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub enum Scope {
    Widget(String), // instance_id
    Group(String),  // group_id
}

impl ToString for Scope {
    fn to_string(&self) -> String {
        match self {
            Scope::Widget(instance_id) => format!("w_{}", instance_id),
            Scope::Group(group_id) => format!("g_{}", group_id),
        }
    }
}

impl FileManager {
    pub fn new() -> Self {
        Self {
            data: app_data_dir().expect("Failed to determine data directory"),
            cache: app_cache_dir().expect("Failed to determine cache directory"),
        }
    }

    fn data_directory(&self) -> DirectoryHandle {
        DirectoryHandle::new(&self.data).expect("Failed to create data directory handle")
    }

    pub fn kv_store(&self, scope: Scope) -> DirectoryHandle {
        let path = self.data.join("kv").join(scope.to_string());
        DirectoryHandle::new(&path).expect("Failed to create kv store directory handle")
    }

    pub fn object_store(
        &self,
        scope: Scope,
        collection: Option<String>,
    ) -> DirectoryHandle {
        let path = self.data.join("objects").join(scope.to_string());
        let path = if let Some(c) = collection {
            path.join(c)
        } else {
            path
        };
        DirectoryHandle::new(&path).expect("Failed to create object store directory handle")
    }

    fn cache_directory(&self) -> DirectoryHandle {
        DirectoryHandle::new(&self.cache).expect("Failed to create cache directory handle")
    }

    pub fn get_cache_directory(&self, name: &str) -> DirectoryHandle {
        DirectoryHandle::new(&self.cache.join(name))
            .expect("Failed to create cache subdirectory handle")
    }
}

pub struct DirectoryHandle {
    root: PathBuf,
}

impl DirectoryHandle {
    pub fn new(path: &PathBuf) -> Result<Self, String> {
        tracing::trace!("Creating DirectoryHandle for path: {:?}", path);
        if path.is_dir() {
            Ok(Self { root: path.clone() })
        } else if path.exists(){
            Err(format!("Path {:?} is not a directory", path))
        } else {
            std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
            Ok(Self { root: path.clone() })
        }
    }

    fn ensure_root_exists(&self) -> Result<(), String> {
        if !self.root.exists() {
            std::fs::create_dir_all(&self.root).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn list_entries(&self) -> Result<Vec<PathBuf>, String> {
        tracing::trace!("Listing entries in directory: {:?}", self.root);
        let mut files = Vec::new();
        for entry in std::fs::read_dir(&self.root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            files.push(entry.path());
        }
        Ok(files)
    }

    fn encode_key(key: &str) -> String {
        URL_SAFE_NO_PAD.encode(key)
    }

    fn decode_key(encoded: &str) -> Option<String> {
        URL_SAFE_NO_PAD
            .decode(encoded)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
    }

    fn construct_path(&self, key: &str) -> PathBuf {
        let encoded_key = Self::encode_key(key);
        let mut path = self.root.join(encoded_key);
        path.set_extension("json");
        path
    }

    fn decode_path(path: &PathBuf) -> Option<String> {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .and_then(|stem_str| Self::decode_key(stem_str))
    }

    fn compare(path: &PathBuf, key: &str) -> bool {
        if let Some(decoded_key) = Self::decode_path(path) {
            decoded_key == key
        } else {
            false
        }
    }

    fn create(&self, key: &str) -> Result<FileHandle, String> {
        tracing::debug!("Creating file for key: {}", key);
        self.ensure_root_exists()?;
        let path = self.construct_path(key);
        if path.exists() {
            Err(format!("File for key '{}' already exists", key))
        } else {
            Ok(FileHandle::new(path))
        }
    }

    fn get_or_create(&self, key: &str) -> FileHandle {
        tracing::debug!("Getting or creating file for key: {}", key);
        let _ = self.ensure_root_exists(); // FIXME: Handle error properly
        FileHandle::new(self.construct_path(key))
    }

    fn get(&self, key: &str) -> Result<Option<FileHandle>, String> {
        tracing::debug!("Getting file for key: {}", key);
        self.ensure_root_exists()?;
        let path = self.construct_path(key);
        if path.exists() {
            Ok(Some(FileHandle::new(path)))
        } else {
            Ok(None)
        }
    }

    fn delete(&self, key: &str, strict: bool) -> Result<(), String> {
        tracing::debug!("Deleting file for key: {}", key);
        self.ensure_root_exists()?;
        let path = self.construct_path(key);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())
        } else if strict {
            Err(format!("File for key '{}' does not exist", key))
        } else {
            Ok(())
        }
    }
}

struct FileHandle {
    path: PathBuf,
}

impl FileHandle {
    fn new(path: PathBuf) -> Self {
        tracing::trace!("Creating FileHandle for path: {:?}", path);
        Self { path }
    }

    fn read_as<T: DeserializeOwned>(&self) -> Result<T, String> {
        tracing::debug!("Reading file as DeserializeOwned from path: {:?}", self.path);
        let file = File::open(&self.path).map_err(|e| e.to_string())?;
        serde_json::from_reader(file).map_err(|e| e.to_string())
    }

    fn read_raw(&self) -> Result<Vec<u8>, String> {
        tracing::debug!("Reading raw bytes from file at path: {:?}", self.path);
        std::fs::read(&self.path).map_err(|e| e.to_string())
    }

    fn write_raw(&self, data: &[u8]) -> Result<(), String> {
        tracing::debug!("Writing raw bytes to file at path: {:?}", self.path);
        let temp_path = self.path.with_extension("json.tmp");
        std::fs::write(&temp_path, data).map_err(|e| e.to_string())?;
        std::fs::rename(&temp_path, &self.path).map_err(|e| e.to_string())
    }

    fn write_from<T: Serialize>(&self, data: &T) -> Result<(), String> {
        tracing::debug!("Writing serializable data to file at path: {:?}", self.path);
        let json_data = serde_json::to_vec(data).map_err(|e| e.to_string())?;
        self.write_raw(&json_data)
    }

    fn write_string(&self, data: &str) -> Result<(), String> {
        tracing::debug!("Writing string to file at path: {:?}", self.path);
        self.write_raw(data.as_bytes())
    }
}

// COMMANDS

macro_rules! file_manager {
    ($app:expr) => {
        $app.state::<AppState>()
            .lock()
            .await
            .file_manager
            .read()
            .await
    };
}
// key-value store commands

#[tauri::command]
pub async fn get_kv(
    key: String,
    scope: Scope,
    app: tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    tracing::debug!("Getting key-value for key: {}, scope: {:?}", key, scope);
    let file_handle = file_manager!(app)
        .kv_store(scope)
        .get(&key)
        .map_err(|e| format!("Failed to get file handle: {}", e))?;

    match file_handle {
        Some(handle) => handle.read_as().map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn set_kv(
    key: String,
    value: serde_json::Value,
    scope: Scope,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tracing::debug!("Setting key-value for key: {}, scope: {:?}", key, scope);
    let file_handle = file_manager!(app).kv_store(scope).get_or_create(&key);
    file_handle.write_from(&value)
}

#[tauri::command]
pub async fn delete_kv(
    key: String,
    scope: Scope,
    strict: Option<bool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tracing::debug!("Deleting key-value for key: {}, scope: {:?}", key, scope);
    file_manager!(app)
        .kv_store(scope)
        .delete(&key, strict.unwrap_or(false))
}

#[tauri::command]
pub async fn list_kv(scope: Scope, app: tauri::AppHandle) -> Result<Vec<String>, String> {
    tracing::debug!("Listing key-values for scope: {:?}", scope);
    let entries = file_manager!(app).kv_store(scope).list_entries()?;
    let mut keys = Vec::new();

    for entry in entries {
        if let Some(decoded_key) = DirectoryHandle::decode_path(&entry) {
            keys.push(decoded_key);
        }
    }

    Ok(keys)
}

// object store commands

#[tauri::command]
pub async fn get_object(
    key: String,
    scope: Scope,
    collection: Option<String>,
    app: tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    tracing::debug!("Getting object for key: {}, scope: {:?}, collection: {:?}", key, scope, collection);
    match file_manager!(app)
        .object_store(scope, collection)
        .get(&key)?
    {
        Some(handle) => handle.read_as().map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn set_object(
    key: String,
    value: serde_json::Value,
    scope: Scope,
    collection: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tracing::debug!("Setting object for key: {}, scope: {:?}, collection: {:?}", key, scope, collection);
    file_manager!(app)
        .object_store(scope, collection)
        .get_or_create(&key)
        .write_from(&value)
}

#[tauri::command]
pub async fn delete_object(
    key: String,
    scope: Scope,
    collection: Option<String>,
    strict: Option<bool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    tracing::debug!("Deleting object for key: {}, scope: {:?}, collection: {:?}", key, scope, collection);
    file_manager!(app)
        .object_store(scope, collection)
        .delete(&key, strict.unwrap_or(false))
}

#[tauri::command]
pub async fn list_objects(
    scope: Scope,
    collection: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    tracing::debug!("Listing objects for scope: {:?}, collection: {:?}", scope, collection);
    let entries = file_manager!(app)
        .object_store(scope, collection)
        .list_entries()?;
    let mut keys = Vec::new();

    for entry in entries {
        if let Some(decoded_key) = DirectoryHandle::decode_path(&entry) {
            keys.push(decoded_key);
        }
    }

    Ok(keys)
}

