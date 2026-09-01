//! Generate-from-colour: derives a dark/light theme pair from one seed hex via OKLCH.

use std::fs;

use super::{theme_path, ThemeData, ThemeVar};

fn hex_to_linear(c: u8) -> f64 {
    let s = c as f64 / 255.0;
    if s <= 0.04045 {
        s / 12.92
    } else {
        ((s + 0.055) / 1.055_f64).powf(2.4)
    }
}

fn srgb_to_oklab(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let rl = hex_to_linear(r);
    let gl = hex_to_linear(g);
    let bl = hex_to_linear(b);
    let l = (0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl).cbrt();
    let m = (0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl).cbrt();
    let s = (0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl).cbrt();
    (
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    )
}

fn oklab_to_oklch(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    let c = (a * a + b * b).sqrt();
    let h = b.atan2(a).to_degrees().rem_euclid(360.0);
    (l, c, h)
}

fn oklch_to_oklab(l: f64, c: f64, h: f64) -> (f64, f64, f64) {
    let h_rad = h.to_radians();
    (l, c * h_rad.cos(), c * h_rad.sin())
}

fn oklab_to_linear_srgb(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    let l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = l - 0.0894841775 * a - 1.2914855480 * b;
    let l3 = l_ * l_ * l_;
    let m3 = m_ * m_ * m_;
    let s3 = s_ * s_ * s_;
    (
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
    )
}

fn linear_to_srgb_channel(c: f64) -> u8 {
    let v = if c <= 0.0031308 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    };
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn oklch_to_hex(l: f64, c: f64, h: f64) -> String {
    let (lab_l, lab_a, lab_b) = oklch_to_oklab(l, c, h);
    let (rl, gl, bl) = oklab_to_linear_srgb(lab_l, lab_a, lab_b);
    return format!(
        "#{:02x}{:02x}{:02x}",
        linear_to_srgb_channel(rl),
        linear_to_srgb_channel(gl),
        linear_to_srgb_channel(bl),
    )
}

fn hue_to_name(h: f64) -> &'static str {
    match h as u32 {
        0..=14 => "Red",
        15..=44 => "Orange",
        45..=59 => "Amber",
        60..=74 => "Yellow",
        75..=104 => "Lime",
        105..=149 => "Green",
        150..=179 => "Teal",
        180..=209 => "Cyan",
        210..=239 => "Sky",
        240..=269 => "Blue",
        270..=299 => "Violet",
        300..=329 => "Purple",
        330..=344 => "Pink",
        _ => "Rose",
    }
}

fn parse_hex(hex: &str) -> Result<(u8, u8, u8), String> {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return Err(format!("invalid hex colour: {hex}"));
    }
    let r = u8::from_str_radix(&h[0..2], 16).map_err(|e| e.to_string())?;
    let g = u8::from_str_radix(&h[2..4], 16).map_err(|e| e.to_string())?;
    let b = u8::from_str_radix(&h[4..6], 16).map_err(|e| e.to_string())?;
    Ok((r, g, b))
}

fn make_theme(seed_hex: &str, dark: bool) -> Result<ThemeData, String> {
    let (r, g, b) = parse_hex(seed_hex).map_err(|err| err.to_string())?;
    let (lab_l, lab_a, lab_b) = srgb_to_oklab(r, g, b);
    let (_, c, h) = oklab_to_oklch(lab_l, lab_a, lab_b);

    // Clamp chroma for palette generation
    let pc = c.min(0.12);

    let base;
    let surface;
    let border;
    let text;
    let text_dim;
    let text_muted;
    let text_subtle;
    let accent;
    let success;
    let warning;
    let danger;

    if dark {
        base = oklch_to_hex(0.12, pc * 0.5, h);
        surface = oklch_to_hex(0.18, pc * 0.6, h);
        border = oklch_to_hex(0.28, pc * 0.7, h);
        text_subtle = oklch_to_hex(0.48, 0.02, h);
        danger = oklch_to_hex(0.60, 0.20, 25.0);
        text_muted = oklch_to_hex(0.62, 0.02, h);
        accent = oklch_to_hex(0.65_f64.max(lab_l).min(0.78), c.min(0.18), h);
        success = oklch_to_hex(0.65, 0.15, 145.0);
        text_dim = oklch_to_hex(0.80, 0.015, h);
        warning = oklch_to_hex(0.72, 0.15, 75.0);
        text = oklch_to_hex(0.92, 0.01, h);
    } else {
        base = oklch_to_hex(0.92, pc * 0.5, h);
        surface = oklch_to_hex(0.72, pc * 0.6, h);
        border = oklch_to_hex(0.80, pc * 0.7, h);
        text_subtle = oklch_to_hex(0.65, 0.02, h);
        danger = oklch_to_hex(0.65, 0.20, 25.0);
        text_muted = oklch_to_hex(0.62, 0.02, h);
        accent = oklch_to_hex(0.60_f64.max(lab_l).min(0.78), c.min(0.18), h);
        success = oklch_to_hex(0.48, 0.15, 145.0);
        text_dim = oklch_to_hex(0.28, 0.015, h);
        warning = oklch_to_hex(0.28, 0.15, 75.0);
        text = oklch_to_hex(0.12, 0.01, h);
    }

    let color_scheme = if 0.12_f64 < 0.5 { "dark" } else { "light" }.to_string();

    Ok(ThemeData {
        id: format!("_generated_{}", if dark { "dark" } else { "light" }),
        name: format!(
            "{} {} (Generated)",
            hue_to_name(h),
            if dark { "Dark" } else { "Light" }
        ),
        color_scheme,
        vars: vec![
            ThemeVar::Color {
                label: "base".into(),
                value: base,
            },
            ThemeVar::Color {
                label: "surface".into(),
                value: surface,
            },
            ThemeVar::Color {
                label: "border".into(),
                value: border,
            },
            ThemeVar::Color {
                label: "text".into(),
                value: text,
            },
            ThemeVar::Color {
                label: "text-dim".into(),
                value: text_dim,
            },
            ThemeVar::Color {
                label: "text-muted".into(),
                value: text_muted,
            },
            ThemeVar::Color {
                label: "text-subtle".into(),
                value: text_subtle,
            },
            ThemeVar::Color {
                label: "accent".into(),
                value: accent,
            },
            ThemeVar::Color {
                label: "success".into(),
                value: success,
            },
            ThemeVar::Color {
                label: "warning".into(),
                value: warning,
            },
            ThemeVar::Color {
                label: "danger".into(),
                value: danger,
            },
            ThemeVar::Font {
                label: "ui".into(),
                value: vec!["Quicksand".into(), "sans-serif".into()],
            },
            ThemeVar::Font {
                label: "mono".into(),
                value: vec!["monospace".into()],
            },
        ],
    })
}

#[tauri::command]
pub async fn generate_theme(seed_hex: String) -> Result<(), String> {
    let dark_theme = make_theme(&seed_hex, true)?;
    let light_theme = make_theme(&seed_hex, false)?;

    let dark_path = theme_path("_generated_dark")?;
    if let Some(parent) = dark_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&dark_theme).map_err(|e| e.to_string())?;
    fs::write(&dark_path, json).map_err(|e| e.to_string())?;

    let light_path = theme_path("_generated_light")?;
    if let Some(parent) = light_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&light_theme).map_err(|e| e.to_string())?;
    fs::write(&light_path, json).map_err(|e| e.to_string())?;

    Ok(())
}
