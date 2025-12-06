use crate::db;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUsage {
    pub plugin_id: String,
    pub name: Option<String>,
    pub open_count: u64,
    pub last_opened: u64,
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn record_plugin_open(
    plugin_id: String,
    name: Option<String>,
    app_data_dir: &Path,
) -> Result<PluginUsage, String> {
    let mut conn = db::get_connection(app_data_dir)?;
    let ts = now_ts();

    conn.execute(
        r#"
        INSERT INTO plugin_usage (plugin_id, name, open_count, last_opened)
        VALUES (?1, ?2, 1, ?3)
        ON CONFLICT(plugin_id) DO UPDATE SET
            open_count = plugin_usage.open_count + 1,
            last_opened = excluded.last_opened,
            name = COALESCE(excluded.name, plugin_usage.name)
        "#,
        params![plugin_id, name, ts as i64],
    )
    .map_err(|e| format!("Failed to record plugin usage: {}", e))?;

    get_plugin_usage_by_id(&mut conn, &plugin_id)
}

fn get_plugin_usage_by_id(
    conn: &mut rusqlite::Connection,
    plugin_id: &str,
) -> Result<PluginUsage, String> {
    conn.query_row(
        "SELECT plugin_id, name, open_count, last_opened FROM plugin_usage WHERE plugin_id = ?1",
        params![plugin_id],
        |row| {
            Ok(PluginUsage {
                plugin_id: row.get::<_, String>(0)?,
                name: row.get::<_, Option<String>>(1)?,
                open_count: row.get::<_, i64>(2)? as u64,
                last_opened: row.get::<_, i64>(3)? as u64,
            })
        },
    )
    .map_err(|e| format!("Failed to fetch plugin usage: {}", e))
}

pub fn list_plugin_usage(app_data_dir: &Path) -> Result<Vec<PluginUsage>, String> {
    let mut conn = db::get_connection(app_data_dir)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT plugin_id, name, open_count, last_opened
            FROM plugin_usage
            ORDER BY open_count DESC, last_opened DESC
        "#,
        )
        .map_err(|e| format!("Failed to prepare plugin usage query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PluginUsage {
                plugin_id: row.get::<_, String>(0)?,
                name: row.get::<_, Option<String>>(1)?,
                open_count: row.get::<_, i64>(2)? as u64,
                last_opened: row.get::<_, i64>(3)? as u64,
            })
        })
        .map_err(|e| format!("Failed to iterate plugin usage rows: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("Failed to read plugin usage row: {}", e))?);
    }

    Ok(results)
}

