use std::{fs, path::PathBuf};

mod commands;
mod generate;

pub use self::commands::*;
pub use self::generate::*;

pub const TARGET: &str = "theme";

/// A single typed CSS variable entry. The CSS variable name is assembled as
/// `--{type}-{label}` (e.g. Color { label: "base" } -> `--color-base`).
#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ThemeVar {
    Color { label: String, value: String },
    Font  { label: String, value: Vec<String> },
}

impl ThemeVar {
    fn css_line(&self) -> String {
        match self {
            Self::Color { label, value } => format!("  --color-{label}: {value};"),
            Self::Font  { label, value } => format!("  --font-{label}: {};", value.join(", ")),
        }
    }
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct ThemeData {
    pub id: String,
    pub name: String,
    pub vars: Vec<ThemeVar>,
    pub color_scheme: String,
}

impl ThemeData {
    pub fn to_css(&self) -> String {
        let lines: Vec<String> = self.vars.iter().map(|v| v.css_line()).collect();
        format!(":root {{\n  color-scheme: {};\n{}\n}}", self.color_scheme, lines.join("\n"))
    }
}

/// Lightweight summary returned by `list_themes`.
#[derive(serde::Serialize, Clone, Debug, ts_rs::TS)]
#[ts(export, export_to = "../../src/ffi_types.ts")]
pub struct ThemeInfo {
    pub id: String,
    pub name: String,
}

/* Path helpers  */

pub fn get_themes_root() -> Option<PathBuf> {
    crate::config::app_config_dir().map(|mut p| {
        p.push("themes");
        p
    })
}

pub(crate) fn theme_path(id: &str) -> Result<PathBuf, String> {
    let root = get_themes_root().ok_or("cannot determine themes directory")?;
    Ok(root.join(format!("{}.json", id)))
}

pub(crate) fn load_theme_css(id: &str) -> Result<String, String> {
    let path = theme_path(id)?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: ThemeData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data.to_css())
}

/* Default themes  */

const DEFAULT_THEMES: &[(&str, &str)] = &[
    ("e58e167b-8c7d-4b88-9c20-46b25147ab25", include_str!("../../themes/dark.json")),
    ("3227d82e-90a3-421e-8a36-29b43d5ab18c", include_str!("../../themes/light.json")),
    ("6dcea86b-f7fe-48b4-8e61-9c35c381000a", include_str!("../../themes/solarized-dark.json")),
    ("11011b97-03a0-4d66-a842-115d5d2fdd05", include_str!("../../themes/solarized-light.json")),
    ("4d6cef34-219c-4b4a-8005-989ad37e70d3", include_str!("../../themes/catppuccin-mocha.json")),
    ("eb57973a-f744-4617-bfbc-41e01c67d9a9", include_str!("../../themes/nord.json")),
    ("29b963d4-15f2-4436-974f-535e273b75a3", include_str!("../../themes/dracula.json")),
    ("2310da9d-6cc3-4891-88a9-1322784d6293", include_str!("../../themes/rose-pine.json")),
    ("b1e3eaa5-d37a-4dc4-90b4-ba7a4fbcacf2", include_str!("../../themes/gruvbox-dark.json")),
];

pub fn ensure_default_themes() {
    let root = match get_themes_root() {
        Some(d) => d,
        None => return,
    };
    if let Err(e) = fs::create_dir_all(&root) {
        tracing::warn!(target: TARGET, error = %e, "failed to create themes dir");
        return;
    }
    for (id, json) in DEFAULT_THEMES {
        let path = root.join(format!("{}.json", id));
        #[cfg(not(debug_assertions))]
        if !path.exists() {
            if let Err(e) = fs::write(&path, json) {
                tracing::warn!(target: TARGET, id, error = %e, "failed to write default theme");
            }
        }
        #[cfg(debug_assertions)]
        {
            if let Err(e) = fs::write(&path, json) {
                tracing::warn!(target: TARGET, id, error = %e, "failed to write default theme");
            }
        }
    }
    tracing::debug!(target: TARGET, path = %root.display(), "default themes ensured");
}
