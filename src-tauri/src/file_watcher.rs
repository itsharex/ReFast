use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use notify::{Watcher, RecommendedWatcher, RecursiveMode, Event, EventKind};
use tauri::{AppHandle, Emitter, Manager};

type WatcherMap = Arc<Mutex<HashMap<String, RecommendedWatcher>>>;

// 全局文件监听器映射：窗口标签 -> 文件路径 -> 监听器
static FILE_WATCHERS: std::sync::OnceLock<WatcherMap> = std::sync::OnceLock::new();

fn get_watchers() -> WatcherMap {
    FILE_WATCHERS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

/// 开始监听文件变化
pub fn watch_file(app: AppHandle, window_label: String, file_path: String) -> Result<(), String> {
    use notify::Watcher as _;
    
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    
    // 获取文件的父目录（监听目录而不是文件本身，因为某些系统只支持目录监听）
    let watch_path = path.parent()
        .ok_or_else(|| "无法获取文件目录".to_string())?
        .to_path_buf();
    
    let watchers = get_watchers();
    let key = format!("{}:{}", window_label, file_path);
    
    // 如果已经存在监听器，先停止旧的
    if let Ok(mut map) = watchers.lock() {
        if let Some(mut old_watcher) = map.remove(&key) {
            let _ = old_watcher.unwatch(&watch_path);
        }
    }
    
    // 创建新的监听器
    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            match result {
                Ok(event) => {
                    // 检查是否是目标文件的变化
                    if let EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) = event.kind {
                        for path in &event.paths {
                            if path == &PathBuf::from(&file_path) {
                                // 文件变化了，发送事件到前端
                                let app_clone = app.clone();
                                let window_label_clone = window_label.clone();
                                let file_path_clone = file_path.clone();
                                
                                // 延迟一小段时间再读取，确保文件写入完成
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(100));
                                    
                                    // 读取文件内容
                                    match std::fs::read_to_string(&file_path_clone) {
                                        Ok(content) => {
                                            // 发送事件到前端
                                            if let Some(window) = app_clone.get_webview_window(&window_label_clone) {
                                                let _ = window.emit("markdown-file-changed", content);
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("读取文件失败: {}", e);
                                        }
                                    }
                                });
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("文件监听错误: {}", e);
                }
            }
        },
        notify::Config::default()
    ).map_err(|e| format!("创建文件监听器失败: {}", e))?;
    
    // 开始监听目录
    watcher.watch(&watch_path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("开始监听文件失败: {}", e))?;
    
    // 保存监听器
    if let Ok(mut map) = watchers.lock() {
        map.insert(key, watcher);
    }
    
    Ok(())
}

/// 停止监听文件
pub fn unwatch_file(window_label: String, file_path: String) -> Result<(), String> {
    let watchers = get_watchers();
    let key = format!("{}:{}", window_label, file_path);
    
    if let Ok(mut map) = watchers.lock() {
        if let Some(mut watcher) = map.remove(&key) {
            let path = PathBuf::from(&file_path);
            if let Some(parent) = path.parent() {
                let _ = watcher.unwatch(parent);
            }
        }
    }
    
    Ok(())
}

/// 停止窗口的所有监听
pub fn unwatch_window(window_label: String) -> Result<(), String> {
    let watchers = get_watchers();
    
    if let Ok(mut map) = watchers.lock() {
        let keys_to_remove: Vec<String> = map.keys()
            .filter(|k| k.starts_with(&format!("{}:", window_label)))
            .cloned()
            .collect();
        
        for key in keys_to_remove {
            if let Some(mut watcher) = map.remove(&key) {
                // 从 key 中提取文件路径
                if let Some(file_path) = key.split(':').nth(1) {
                    let path = PathBuf::from(file_path);
                    if let Some(parent) = path.parent() {
                        let _ = watcher.unwatch(parent);
                    }
                }
            }
        }
    }
    
    Ok(())
}

