use crate::db;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct WindowConfig {
    pub position: Option<WindowPosition>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AllWindowConfigs {
    pub launcher: WindowConfig,
}

pub fn get_window_config_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("window_config.json")
}

pub fn load_window_config(app_data_dir: &Path) -> Result<AllWindowConfigs, String> {
    let conn = db::get_connection(app_data_dir)?;
    maybe_migrate_from_json(&conn, app_data_dir)?;

    let config: Option<(Option<i32>, Option<i32>)> = conn
        .query_row(
            "SELECT x, y FROM window_config WHERE key = 'launcher' LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("Failed to load window config: {}", e))?;

    if let Some((x, y)) = config {
        Ok(AllWindowConfigs {
            launcher: WindowConfig {
                position: match (x, y) {
                    (Some(x), Some(y)) => Some(WindowPosition { x, y }),
                    _ => None,
                },
            },
        })
    } else {
        Ok(AllWindowConfigs::default())
    }
}

pub fn save_window_config(
    app_data_dir: &Path,
    configs: &AllWindowConfigs,
) -> Result<(), String> {
    let conn = db::get_connection(app_data_dir)?;
    let (x, y) = configs
        .launcher
        .position
        .as_ref()
        .map(|p| (Some(p.x), Some(p.y)))
        .unwrap_or((None, None));

    conn.execute(
        "INSERT INTO window_config (key, x, y) VALUES ('launcher', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET x = excluded.x, y = excluded.y",
        params![x, y],
    )
    .map_err(|e| format!("Failed to save window config: {}", e))?;

    Ok(())
}

pub fn save_launcher_position(
    app_data_dir: &Path,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let mut configs = load_window_config(app_data_dir).unwrap_or_default();
    configs.launcher.position = Some(WindowPosition { x, y });
    save_window_config(app_data_dir, &configs)
}

pub fn get_launcher_position(app_data_dir: &Path) -> Option<WindowPosition> {
    load_window_config(app_data_dir)
        .ok()
        .and_then(|configs| configs.launcher.position)
}

fn maybe_migrate_from_json(
    conn: &rusqlite::Connection,
    app_data_dir: &Path,
) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM window_config", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count window_config rows: {}", e))?;

    if count == 0 {
        let json_path = get_window_config_file_path(app_data_dir);
        if json_path.exists() {
            if let Ok(content) = fs::read_to_string(&json_path) {
                if let Ok(cfg) = serde_json::from_str::<AllWindowConfigs>(&content) {
                    let _ = save_window_config(app_data_dir, &cfg);
                }
            }
        }
    }

    Ok(())
}


