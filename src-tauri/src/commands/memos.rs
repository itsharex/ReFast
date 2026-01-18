//! 备忘录相关命令模块
//! 
//! 提供备忘录的 CRUD 操作

use crate::memos;
use super::get_app_data_dir;
use tauri::AppHandle;

/// 获取所有备忘录
#[tauri::command]
pub fn get_all_memos(app: AppHandle) -> Result<Vec<memos::MemoItem>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    memos::get_all_memos(&app_data_dir)
}

/// 添加备忘录
#[tauri::command]
pub fn add_memo(
    title: String,
    content: String,
    app: AppHandle,
) -> Result<memos::MemoItem, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    memos::add_memo(title, content, &app_data_dir)
}

/// 更新备忘录
#[tauri::command]
pub fn update_memo(
    id: String,
    title: Option<String>,
    content: Option<String>,
    app: AppHandle,
) -> Result<memos::MemoItem, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    memos::update_memo(id, title, content, &app_data_dir)
}

/// 删除备忘录
#[tauri::command]
pub fn delete_memo(id: String, app: AppHandle) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    memos::delete_memo(id, &app_data_dir)
}

/// 搜索备忘录
#[tauri::command]
pub fn search_memos(query: String, app: AppHandle) -> Result<Vec<memos::MemoItem>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    memos::search_memos(&query, &app_data_dir)
}
