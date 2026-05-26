use serde_json::Map;
use std::sync::atomic::{AtomicU64, Ordering};

fn random_u64() -> u64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    // Mix nanos and sequence with an LCG multiplier to reduce correlation
    nanos.wrapping_add(seq.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts", type = "string")]
pub struct WidgetId(pub u64);

impl WidgetId {
    pub fn new() -> Self {
        WidgetId(random_u64())
    }
}

impl Default for WidgetId {
    fn default() -> Self {
        WidgetId::new()
    }
}

impl serde::Serialize for WidgetId {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&format!("{:016x}", self.0))
    }
}

impl<'de> serde::Deserialize<'de> for WidgetId {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        let n = u64::from_str_radix(&s, 16).map_err(serde::de::Error::custom)?;
        Ok(WidgetId(n))
    }
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct WidgetConfig {
    #[serde(default)]
    #[ts(type = "string")]
    pub id: WidgetId,
    /// The identifier of the widget type, e.g. "cpu", "memory", "custom-chart", etc.
    pub r#type: String,
    /// The placement of the widget in the grid layout.
    pub placement: WidgetPlacement,
    /// Arbitrary options for the widget, which can be used to configure its behavior and appearance.
    #[ts(type="Record<string, any>", optional)]
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub options: Map<String, serde_json::Value>,
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct WidgetPlacement {
    /// 1-indexed CSS grid column start.
    pub col: u32,
    /// 1-indexed CSS grid row start.
    pub row: u32,
    pub col_span: u32,
    pub row_span: u32,
}