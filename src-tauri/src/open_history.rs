use crate::db;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpenHistoryItem {
    pub key: String,        // path or id that uniquely identifies the item
    pub last_opened: u64,   // Unix timestamp
}

static OPEN_HISTORY: LazyLock<Arc<Mutex<HashMap<String, u64>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

pub fn get_history_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("open_history.json")
}

pub fn lock_history() -> Result<std::sync::MutexGuard<'static, HashMap<String, u64>>, String> {
    OPEN_HISTORY
        .lock()
        .map_err(|e| format!("Failed to lock open history: {}", e))
}

// Load history into an already-locked state (no additional locking)
pub fn load_history_into(
    state: &mut HashMap<String, u64>,
    app_data_dir: &Path,
) -> Result<(), String> {
    let mut conn = db::get_connection(app_data_dir)?;
    maybe_migrate_from_json(&mut conn, app_data_dir)?;

    let mut stmt = conn
        .prepare("SELECT key, last_opened FROM open_history")
        .map_err(|e| format!("Failed to prepare open_history query: {}", e))?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?)))
        .map_err(|e| format!("Failed to iterate open_history rows: {}", e))?;

    state.clear();
    for row in rows {
        let (k, v) = row.map_err(|e| format!("Failed to read open_history row: {}", e))?;
        state.insert(k, v);
    }

    Ok(())
}

// Legacy function for backward compatibility - but now uses lock_history internally
pub fn load_history(app_data_dir: &Path) -> Result<(), String> {
    let mut state = lock_history()?;
    load_history_into(&mut state, app_data_dir)
}

// Save history from a provided state (no locking)
fn save_history_internal(
    state: &HashMap<String, u64>,
    app_data_dir: &Path,
) -> Result<(), String> {
    let mut conn = db::get_connection(app_data_dir)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start open_history transaction: {}", e))?;

    tx.execute("DELETE FROM open_history", [])
        .map_err(|e| format!("Failed to clear open_history table: {}", e))?;

    for (key, ts) in state.iter() {
        tx.execute(
            "INSERT INTO open_history (key, last_opened) VALUES (?1, ?2)",
            params![key, *ts as i64],
        )
        .map_err(|e| format!("Failed to insert open_history row: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit open_history: {}", e))?;

    Ok(())
}

// Legacy function for backward compatibility
pub fn save_history(app_data_dir: &Path) -> Result<(), String> {
    let state = lock_history()?;
    save_history_internal(&state, app_data_dir)
}

pub fn record_open(key: String, app_data_dir: &Path) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();

    let mut state = lock_history()?;
    if state.is_empty() {
        load_history_into(&mut state, app_data_dir).ok();
    }
    state.insert(key, timestamp);
    drop(state);

    // Save to disk
    save_history(app_data_dir)?;

    Ok(())
}

pub fn get_last_opened(key: &str) -> Option<u64> {
    let state = lock_history().ok()?;
    state.get(key).copied()
}

pub fn get_all_history(app_data_dir: &Path) -> Result<HashMap<String, u64>, String> {
    let mut state = lock_history()?;
    load_history_into(&mut state, app_data_dir).ok(); // Ignore errors if file doesn't exist
    Ok(state.clone())
}

fn maybe_migrate_from_json(
    conn: &mut rusqlite::Connection,
    app_data_dir: &Path,
) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM open_history", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count open_history rows: {}", e))?;

    if count == 0 {
        let json_path = get_history_file_path(app_data_dir);
        if json_path.exists() {
            if let Ok(content) = fs::read_to_string(&json_path) {
                if let Ok(history) = serde_json::from_str::<HashMap<String, u64>>(&content) {
                    let _ = save_history_internal(&history, app_data_dir);
                }
            }
        }
    }

    Ok(())
}

