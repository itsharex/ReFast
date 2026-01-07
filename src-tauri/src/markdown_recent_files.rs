use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub last_opened: u64, // Unix timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>, // Markdown 文件标题（从内容中提取）
}

static RECENT_FILES: LazyLock<Arc<Mutex<HashMap<String, RecentFile>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

const MAX_RECENT_FILES: usize = 10;

pub fn get_recent_files_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("markdown_recent_files.json")
}

/// 从 Markdown 内容中提取标题
/// 优先提取第一个一级标题（#），如果没有则提取第一个二级标题（##）
fn extract_title_from_markdown(content: &str) -> Option<String> {
    let mut found_h1 = false;
    let mut h2_title: Option<String> = None;
    
    for line in content.lines() {
        let trimmed = line.trim();
        // 检查一级标题
        if trimmed.starts_with("# ") && trimmed.len() > 2 {
            let title = trimmed[2..].trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
            found_h1 = true;
        }
        // 检查二级标题（只有在没有一级标题时才保存）
        if !found_h1 && trimmed.starts_with("## ") && trimmed.len() > 3 {
            let title = trimmed[3..].trim();
            if !title.is_empty() && h2_title.is_none() {
                h2_title = Some(title.to_string());
            }
        }
    }
    
    h2_title
}

fn lock_recent_files() -> Result<std::sync::MutexGuard<'static, HashMap<String, RecentFile>>, String> {
    RECENT_FILES
        .lock()
        .map_err(|e| format!("Failed to lock recent files: {}", e))
}

pub fn load_recent_files(app_data_dir: &Path) -> Result<(), String> {
    let file_path = get_recent_files_file_path(app_data_dir);
    
    let mut state = lock_recent_files()?;
    state.clear();
    
    if file_path.exists() {
        let content = fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read recent files file: {}", e))?;
        
        let files: Vec<RecentFile> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse recent files: {}", e))?;
        
        for file in files {
            state.insert(file.path.clone(), file);
        }
    }
    
    Ok(())
}

fn save_recent_files(app_data_dir: &Path) -> Result<(), String> {
    let file_path = get_recent_files_file_path(app_data_dir);
    
    // 确保目录存在
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    let state = lock_recent_files()?;
    let files: Vec<RecentFile> = state.values().cloned().collect();
    
    let content = serde_json::to_string_pretty(&files)
        .map_err(|e| format!("Failed to serialize recent files: {}", e))?;
    
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write recent files file: {}", e))?;
    
    Ok(())
}

pub fn get_all_recent_files(app_data_dir: &Path) -> Result<Vec<RecentFile>, String> {
    let mut state = lock_recent_files()?;
    
    // 如果状态为空，尝试加载
    if state.is_empty() {
        drop(state);
        load_recent_files(app_data_dir)?;
        state = lock_recent_files()?;
    }
    
    let mut files: Vec<RecentFile> = state.values().cloned().collect();
    // 按最后打开时间降序排序
    files.sort_by(|a, b| b.last_opened.cmp(&a.last_opened));
    // 限制数量
    files.truncate(MAX_RECENT_FILES);
    
    Ok(files)
}

pub fn add_recent_file(app_data_dir: &Path, file_path: String) -> Result<(), String> {
    add_recent_file_with_content(app_data_dir, file_path, None)
}

pub fn add_recent_file_with_content(
    app_data_dir: &Path,
    file_path: String,
    content: Option<String>,
) -> Result<(), String> {
    let mut state = lock_recent_files()?;
    
    // 如果状态为空，尝试加载
    if state.is_empty() {
        drop(state);
        load_recent_files(app_data_dir)?;
        state = lock_recent_files()?;
    }
    
    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("未命名")
        .to_string();
    
    // 从内容中提取标题
    let title = content.as_ref().and_then(|c| extract_title_from_markdown(c));
    
    let recent_file = RecentFile {
        path: file_path.clone(),
        name: file_name,
        last_opened: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        title,
    };
    
    state.insert(file_path, recent_file);
    
    // 如果超过最大数量，移除最旧的
    if state.len() > MAX_RECENT_FILES {
        let mut files: Vec<(String, RecentFile)> = state.drain().collect();
        files.sort_by(|a, b| b.1.last_opened.cmp(&a.1.last_opened));
        files.truncate(MAX_RECENT_FILES);
        for (path, file) in files {
            state.insert(path, file);
        }
    }
    
    drop(state);
    save_recent_files(app_data_dir)?;
    
    Ok(())
}

pub fn remove_recent_file(app_data_dir: &Path, file_path: String) -> Result<(), String> {
    let mut state = lock_recent_files()?;
    
    // 如果状态为空，尝试加载
    if state.is_empty() {
        drop(state);
        load_recent_files(app_data_dir)?;
        state = lock_recent_files()?;
    }
    
    state.remove(&file_path);
    
    drop(state);
    save_recent_files(app_data_dir)?;
    
    Ok(())
}

