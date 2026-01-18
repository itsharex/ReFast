//! 单词记录相关命令模块
//! 
//! 提供单词记录的 CRUD 操作

use crate::word_records;
use super::get_app_data_dir;
use tauri::AppHandle;

/// 获取所有单词记录
#[tauri::command]
pub fn get_all_word_records(app: AppHandle) -> Result<Vec<word_records::WordRecord>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    word_records::get_all_word_records(&app_data_dir)
}

/// 添加单词记录
#[tauri::command]
pub fn add_word_record(
    word: String,
    translation: String,
    context: Option<String>,
    phonetic: Option<String>,
    example_sentence: Option<String>,
    tags: Vec<String>,
    app: AppHandle,
) -> Result<word_records::WordRecord, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    word_records::add_word_record(
        word,
        translation,
        context,
        phonetic,
        example_sentence,
        tags,
        &app_data_dir,
    )
}

/// 更新单词记录
#[tauri::command]
pub fn update_word_record(
    id: String,
    word: Option<String>,
    translation: Option<String>,
    context: Option<String>,
    phonetic: Option<String>,
    example_sentence: Option<String>,
    tags: Option<Vec<String>>,
    ai_explanation: Option<String>,
    mastery_level: Option<i32>,
    is_favorite: Option<bool>,
    is_mastered: Option<bool>,
    app: AppHandle,
) -> Result<word_records::WordRecord, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    word_records::update_word_record(
        id,
        word,
        translation,
        context,
        phonetic,
        example_sentence,
        tags,
        ai_explanation,
        mastery_level,
        is_favorite,
        is_mastered,
        &app_data_dir,
    )
}

/// 删除单词记录
#[tauri::command]
pub fn delete_word_record(id: String, app: AppHandle) -> Result<(), String> {
    let app_data_dir = get_app_data_dir(&app)?;
    word_records::delete_word_record(id, &app_data_dir)
}

/// 搜索单词记录
#[tauri::command]
pub fn search_word_records(query: String, app: AppHandle) -> Result<Vec<word_records::WordRecord>, String> {
    let app_data_dir = get_app_data_dir(&app)?;
    word_records::search_word_records(&query, &app_data_dir)
}
