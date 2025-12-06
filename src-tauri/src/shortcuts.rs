use crate::db;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShortcutItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon: Option<String>, // Optional icon path or base64 data
    pub created_at: u64,      // Unix timestamp
    pub updated_at: u64,      // Unix timestamp
}

static SHORTCUTS: LazyLock<Arc<Mutex<HashMap<String, ShortcutItem>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

pub fn get_shortcuts_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("shortcuts.json")
}

pub fn load_shortcuts(app_data_dir: &Path) -> Result<(), String> {
    let mut state = SHORTCUTS.lock().map_err(|e| e.to_string())?;
    load_shortcuts_into(&mut state, app_data_dir)
}

pub fn save_shortcuts(app_data_dir: &Path) -> Result<(), String> {
    let state = SHORTCUTS.lock().map_err(|e| e.to_string())?;
    save_shortcuts_internal(&state, app_data_dir)
}

pub fn get_all_shortcuts() -> Vec<ShortcutItem> {
    let state = SHORTCUTS.lock().unwrap();
    state.values().cloned().collect()
}

pub fn add_shortcut(
    name: String,
    path: String,
    icon: Option<String>,
    app_data_dir: &Path,
) -> Result<ShortcutItem, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();

    // Generate ID from name and timestamp
    let id = format!("{}_{}", name.replace(" ", "_"), timestamp);

    let shortcut = ShortcutItem {
        id: id.clone(),
        name,
        path,
        icon,
        created_at: timestamp,
        updated_at: timestamp,
    };

    let mut state = SHORTCUTS.lock().map_err(|e| e.to_string())?;
    state.insert(id.clone(), shortcut.clone());
    drop(state);

    save_shortcuts(app_data_dir)?;

    Ok(shortcut)
}

pub fn update_shortcut(
    id: String,
    name: Option<String>,
    path: Option<String>,
    icon: Option<String>,
    app_data_dir: &Path,
) -> Result<ShortcutItem, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();

    let mut state = SHORTCUTS.lock().map_err(|e| e.to_string())?;

    let shortcut = state
        .get_mut(&id)
        .ok_or_else(|| format!("Shortcut not found: {}", id))?;

    if let Some(name) = name {
        shortcut.name = name;
    }
    if let Some(path) = path {
        shortcut.path = path;
    }
    if let Some(icon) = icon {
        shortcut.icon = Some(icon);
    }
    shortcut.updated_at = timestamp;

    let shortcut_clone = shortcut.clone();
    drop(state);

    save_shortcuts(app_data_dir)?;

    Ok(shortcut_clone)
}

pub fn delete_shortcut(id: String, app_data_dir: &Path) -> Result<(), String> {
    let mut state = SHORTCUTS.lock().map_err(|e| e.to_string())?;

    state
        .remove(&id)
        .ok_or_else(|| format!("Shortcut not found: {}", id))?;

    drop(state);

    save_shortcuts(app_data_dir)?;

    Ok(())
}

fn load_shortcuts_into(
    state: &mut HashMap<String, ShortcutItem>,
    app_data_dir: &Path,
) -> Result<(), String> {
    let mut conn = db::get_connection(app_data_dir)?;
    maybe_migrate_from_json(&mut conn, app_data_dir)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, path, icon, created_at, updated_at FROM shortcuts ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare shortcuts query: {}", e))?;

    state.clear();
    let rows = stmt
        .query_map([], |row| {
            Ok(ShortcutItem {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                icon: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to iterate shortcuts: {}", e))?;

    for item in rows {
        let item = item.map_err(|e| format!("Failed to read shortcut row: {}", e))?;
        state.insert(item.id.clone(), item);
    }

    Ok(())
}

fn save_shortcuts_internal(
    state: &HashMap<String, ShortcutItem>,
    app_data_dir: &Path,
) -> Result<(), String> {
    let mut conn = db::get_connection(app_data_dir)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start shortcuts transaction: {}", e))?;

    tx.execute("DELETE FROM shortcuts", [])
        .map_err(|e| format!("Failed to clear shortcuts table: {}", e))?;

    for item in state.values() {
        tx.execute(
            "INSERT INTO shortcuts (id, name, path, icon, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                item.id,
                item.name,
                item.path,
                item.icon,
                item.created_at as i64,
                item.updated_at as i64
            ],
        )
        .map_err(|e| format!("Failed to insert shortcut {}: {}", item.id, e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit shortcuts: {}", e))?;

    Ok(())
}

fn maybe_migrate_from_json(
    conn: &mut rusqlite::Connection,
    app_data_dir: &Path,
) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM shortcuts", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count shortcuts: {}", e))?;

    if count == 0 {
        let json_path = get_shortcuts_file_path(app_data_dir);
        if json_path.exists() {
            if let Ok(content) = fs::read_to_string(&json_path) {
                if let Ok(items) =
                    serde_json::from_str::<HashMap<String, ShortcutItem>>(&content)
                {
                    let mut map = HashMap::new();
                    for (k, v) in items {
                        map.insert(k, v);
                    }
                    let _ = save_shortcuts_internal(&map, app_data_dir);
                }
            }
        }
    }

    Ok(())
}
