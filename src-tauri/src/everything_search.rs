use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::fmt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EverythingResult {
    pub path: String,
    pub name: String,
    pub size: Option<u64>,
    pub date_modified: Option<String>,
    pub is_folder: Option<bool>,
}

/// Everything 错误类型枚举
#[derive(Debug, Clone)]
pub enum EverythingError {
    /// es.exe 未找到
    NotInstalled,
    /// es.exe 文件损坏或无法执行
    ExecutableCorrupted(String),
    /// Everything 服务未运行
    ServiceNotRunning,
    /// 搜索超时
    Timeout,
    /// 进程执行失败
    ExecutionFailed(String),
    /// 查询参数错误
    InvalidQuery(String),
    /// JSON 解析失败
    JsonParseError(String),
    /// 其他错误
    Other(String),
}

impl fmt::Display for EverythingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EverythingError::NotInstalled => {
                write!(f, "NOT_INSTALLED:es.exe 未找到，请安装 Everything 或下载 es.exe")
            }
            EverythingError::ExecutableCorrupted(msg) => {
                write!(f, "EXECUTABLE_CORRUPTED:es.exe 文件损坏或无法执行: {}", msg)
            }
            EverythingError::ServiceNotRunning => {
                write!(f, "SERVICE_NOT_RUNNING:Everything 服务未运行，请启动 Everything 主程序")
            }
            EverythingError::Timeout => {
                write!(f, "TIMEOUT:搜索超时，请缩短关键字或稍后再试")
            }
            EverythingError::ExecutionFailed(msg) => {
                write!(f, "EXECUTION_FAILED:执行失败: {}", msg)
            }
            EverythingError::InvalidQuery(msg) => {
                write!(f, "INVALID_QUERY:查询参数错误: {}", msg)
            }
            EverythingError::JsonParseError(msg) => {
                write!(f, "JSON_PARSE_ERROR:JSON 解析失败: {}", msg)
            }
            EverythingError::Other(msg) => {
                write!(f, "OTHER:{}", msg)
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub mod windows {
    use super::*;
    use std::time::Duration;
    use std::os::windows::process::CommandExt;
    use std::io::Read;

    // Common Everything installation paths
    const EVERYTHING_PATHS: &[&str] = &[
        r"C:\Program Files\Everything\es.exe",
        r"C:\Program Files (x86)\Everything\es.exe",
        r"C:\Tools\Everything\es.exe",
        r"C:\Everything\es.exe",
    ];

    /// 查找 es.exe 可执行文件
    /// 不仅检查文件是否存在，还检查文件大小是否合理（至少 10KB）
    fn find_everything_exe() -> Option<PathBuf> {
        // First, try common installation paths for es.exe only
        for path in EVERYTHING_PATHS {
            let exe_path = PathBuf::from(path);
            if exe_path.exists() {
                // If it's es.exe, check if it's valid
                if exe_path.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.eq_ignore_ascii_case("es.exe"))
                    .unwrap_or(false) {
                    // Check file size - a valid es.exe should be at least 10KB
                    if let Ok(metadata) = std::fs::metadata(&exe_path) {
                        if metadata.len() > 10 * 1024 {
                            return Some(exe_path);
                        }
                    }
                }
            }
        }

        // Try to find Everything.exe and check if es.exe exists in the same directory
        let everything_paths = [
            r"C:\Program Files\Everything\Everything.exe",
            r"C:\Program Files (x86)\Everything\Everything.exe",
        ];
        for everything_path in &everything_paths {
            let exe_path = PathBuf::from(everything_path);
            if exe_path.exists() {
                // Check if es.exe exists in the same directory
                if let Some(parent) = exe_path.parent() {
                    let es_path = parent.join("es.exe");
                    if es_path.exists() {
                        // Check file size
                        if let Ok(metadata) = std::fs::metadata(&es_path) {
                            if metadata.len() > 10 * 1024 {
                                return Some(es_path);
                            }
                        }
                    }
                }
            }
        }

        // Try to find es.exe in PATH
        if let Ok(output) = Command::new("where")
            .arg("es.exe")
            .output()
        {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path_str.is_empty() {
                    // Take the first path if multiple paths are returned
                    let first_path = path_str.lines().next().unwrap_or(&path_str).trim();
                    if !first_path.is_empty() {
                        let path = PathBuf::from(first_path);
                        // Check file size
                        if let Ok(metadata) = std::fs::metadata(&path) {
                            if metadata.len() > 10 * 1024 {
                                return Some(path);
                            }
                        }
                    }
                }
            }
        }

        None
    }

    /// 检查 Everything 服务是否运行
    /// 使用多种方法检查：
    /// 1. 检查 Everything.exe 进程是否存在
    /// 2. 尝试调用 es.exe -update 检查服务可用性
    fn check_everything_service_running(es_exe_path: &PathBuf) -> bool {
        // 首先快速检查 Everything.exe 进程是否存在
        // 如果进程不存在，服务肯定不可用
        let process_exists = if let Ok(output) = Command::new("tasklist")
            .args(&["/FI", "IMAGENAME eq Everything.exe", "/NH"])
            .output()
        {
            if output.status.success() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                output_str.contains("Everything.exe")
            } else {
                false
            }
        } else {
            false
        };

        // 如果进程不存在，直接返回 false
        if !process_exists {
            return false;
        }

        // 进程存在时，尝试调用 es.exe -update 来验证服务是否真的可用
        // 这是一个轻量级的命令，不会修改任何东西，只是检查服务是否可用
        if let Ok(mut child) = Command::new(es_exe_path)
            .arg("-update")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
        {
            // 等待最多 3 秒
            let start = std::time::Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let _ = child.wait();
                        // 检查退出状态码，0 表示成功
                        // 非 0 可能表示服务不可用，但某些情况下也可能是其他错误
                        // 为安全起见，只要进程能正常返回（无论是成功还是失败），都认为服务可用
                        // 因为如果是服务问题，es.exe 通常会返回特定的错误码或挂起
                        return true;
                    }
                    Ok(None) => {
                        if start.elapsed() > Duration::from_secs(3) {
                            // 超时，说明服务可能没有响应
                            let _ = child.kill();
                            let _ = child.wait();
                            return false;
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Err(_) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return false;
                    }
                }
            }
        }

        // 如果无法启动 es.exe，服务不可用
        false
    }

    /// 验证 es.exe 是否可执行
    /// 通过尝试执行一个简单的命令来验证
    fn verify_es_exe_executable(es_exe_path: &PathBuf) -> Result<(), EverythingError> {
        // 尝试执行 es.exe -version 或 -update 来验证可执行性
        let result = Command::new(es_exe_path)
            .arg("-update")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(0x08000000)
            .spawn();

        match result {
            Ok(mut child) => {
                // 等待最多 1 秒
                let start = std::time::Instant::now();
                loop {
                    match child.try_wait() {
                        Ok(Some(_)) => {
                            let _ = child.wait();
                            return Ok(());
                        }
                        Ok(None) => {
                            if start.elapsed() > Duration::from_secs(1) {
                                let _ = child.kill();
                                let _ = child.wait();
                                return Ok(()); // 超时也算可执行（可能是服务问题）
                            }
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        Err(e) => {
                            let _ = child.kill();
                            let _ = child.wait();
                            return Err(EverythingError::ExecutableCorrupted(format!("无法执行: {}", e)));
                        }
                    }
                }
            }
            Err(e) => {
                return Err(EverythingError::ExecutableCorrupted(format!("无法启动进程: {}", e)));
            }
        }
    }

    /// 检查 Everything 是否可用
    /// 不仅检查 es.exe 是否存在，还检查：
    /// 1. es.exe 文件是否有效（大小合理）
    /// 2. es.exe 是否可执行
    /// 3. Everything 服务是否运行
    pub fn is_everything_available() -> bool {
        let es_exe = match find_everything_exe() {
            Some(path) => path,
            None => return false,
        };

        // 验证可执行性
        if verify_es_exe_executable(&es_exe).is_err() {
            return false;
        }

        // 检查服务是否运行
        check_everything_service_running(&es_exe)
    }

    /// 获取 Everything 可用性状态和错误信息
    /// 返回 (是否可用, 错误信息)
    pub fn check_everything_status() -> (bool, Option<String>) {
        let es_exe = match find_everything_exe() {
            Some(path) => path,
            None => return (false, Some("NOT_INSTALLED".to_string())),
        };

        // 验证可执行性
        if let Err(e) = verify_es_exe_executable(&es_exe) {
            return (false, Some(format!("EXECUTABLE_CORRUPTED:{}", e)));
        }

        // 检查服务是否运行
        if !check_everything_service_running(&es_exe) {
            return (false, Some("SERVICE_NOT_RUNNING".to_string()));
        }

        (true, None)
    }

    /// 搜索文件
    /// 
    /// # 参数
    /// - `query`: 搜索查询字符串
    /// - `max_results`: 最大结果数量
    /// 
    /// # 返回
    /// - `Ok(Vec<EverythingResult>)`: 搜索结果
    /// - `Err(EverythingError)`: 错误信息
    pub fn search_files(query: &str, max_results: usize) -> Result<Vec<EverythingResult>, EverythingError> {
        // 验证查询字符串
        if query.trim().is_empty() {
            return Err(EverythingError::InvalidQuery("查询字符串不能为空".to_string()));
        }

        // 查找 es.exe
        let everything_exe = find_everything_exe()
            .ok_or(EverythingError::NotInstalled)?;

        // 验证可执行性
        verify_es_exe_executable(&everything_exe)?;

        // 检查服务是否运行
        if !check_everything_service_running(&everything_exe) {
            return Err(EverythingError::ServiceNotRunning);
        }

        // 处理查询字符串 - 分割空格，但保留引号内的内容
        let query_args = parse_query(query);

        // 尝试使用 JSON 输出（Everything 1.5+ 支持）
        // 如果失败，回退到普通文本输出
        match search_with_json(&everything_exe, &query_args, max_results) {
            Ok(results) => Ok(results),
            Err(_) => {
                // JSON 输出失败，回退到普通文本输出
                search_with_text(&everything_exe, &query_args, max_results)
            }
        }
    }

    /// 解析查询字符串
    /// 支持引号内的空格，例如: "program files" test
    fn parse_query(query: &str) -> Vec<String> {
        let mut args = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;

        for ch in query.chars() {
            match ch {
                '"' => {
                    in_quotes = !in_quotes;
                }
                ' ' if !in_quotes => {
                    if !current.is_empty() {
                        args.push(current.clone());
                        current.clear();
                    }
                }
                _ => {
                    current.push(ch);
                }
            }
        }

        if !current.is_empty() {
            args.push(current);
        }

        // 如果没有引号，按空格分割
        if args.is_empty() {
            args = query.split_whitespace().map(|s| s.to_string()).collect();
        }

        args
    }

    /// 使用 JSON 格式搜索（Everything 1.5+）
    fn search_with_json(
        es_exe_path: &PathBuf,
        query_args: &[String],
        max_results: usize,
    ) -> Result<Vec<EverythingResult>, EverythingError> {
        use std::process::Stdio;
        use std::time::Instant;

        // 构建命令: es.exe -json <query>
        let mut cmd = Command::new(es_exe_path);
        cmd.arg("-json");
        for arg in query_args {
            cmd.arg(arg);
        }
        cmd.arg("-max-results")
            .arg(&max_results.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = cmd.spawn()
            .map_err(|e| EverythingError::ExecutionFailed(format!("无法启动进程: {}", e)))?;

        // 等待输出，带超时
        let start = Instant::now();
        let timeout = Duration::from_secs(5);

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        // 读取 stderr
                        let mut stderr = String::new();
                        if let Some(mut stderr_handle) = child.stderr.take() {
                            let _ = stderr_handle.read_to_string(&mut stderr);
                        }
                        let _ = child.wait();
                        return Err(EverythingError::ExecutionFailed(format!("进程执行失败: {}", stderr)));
                    }
                    break;
                }
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(EverythingError::Timeout);
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(EverythingError::ExecutionFailed(format!("等待进程失败: {}", e)));
                }
            }
        }

        // 获取输出
        let output = child.wait_with_output()
            .map_err(|e| EverythingError::ExecutionFailed(format!("获取输出失败: {}", e)))?;

        // 解析 JSON 输出
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_json_output(&stdout)
    }

    /// 使用文本格式搜索（回退方案）
    fn search_with_text(
        es_exe_path: &PathBuf,
        query_args: &[String],
        max_results: usize,
    ) -> Result<Vec<EverythingResult>, EverythingError> {
        use std::process::Stdio;
        use std::time::Instant;

        // 构建命令: es.exe <query>
        let mut cmd = Command::new(es_exe_path);
        for arg in query_args {
            cmd.arg(arg);
        }
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = cmd.spawn()
            .map_err(|e| EverythingError::ExecutionFailed(format!("无法启动进程: {}", e)))?;

        // 等待输出，带超时
        let start = Instant::now();
        let timeout = Duration::from_secs(5);

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        // 读取 stderr
                        let mut stderr = String::new();
                        if let Some(mut stderr_handle) = child.stderr.take() {
                            let _ = stderr_handle.read_to_string(&mut stderr);
                        }
                        let _ = child.wait();
                        return Err(EverythingError::ExecutionFailed(format!("进程执行失败: {}", stderr)));
                    }
                    break;
                }
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(EverythingError::Timeout);
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(EverythingError::ExecutionFailed(format!("等待进程失败: {}", e)));
                }
            }
        }

        // 获取输出
        let output = child.wait_with_output()
            .map_err(|e| EverythingError::ExecutionFailed(format!("获取输出失败: {}", e)))?;

        // 解析文本输出
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_text_output(&stdout, max_results)
    }

    /// 解析 JSON 输出
    /// Everything JSON 格式示例:
    /// [{"path":"C:\\test.txt","size":1234,"date_modified":1234567890}]
    fn parse_json_output(output: &str) -> Result<Vec<EverythingResult>, EverythingError> {
        #[derive(Deserialize)]
        struct JsonResult {
            path: String,
            #[serde(default)]
            size: Option<u64>,
            #[serde(default)]
            date_modified: Option<u64>,
            #[serde(default)]
            is_folder: Option<bool>,
        }

        let json_results: Vec<JsonResult> = serde_json::from_str(output)
            .map_err(|e| EverythingError::JsonParseError(format!("JSON 解析失败: {}", e)))?;

        let mut results = Vec::new();
        for json_result in json_results {
            let name = std::path::Path::new(&json_result.path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&json_result.path)
                .to_string();

            let date_modified = json_result.date_modified.map(|t| t.to_string());

            results.push(EverythingResult {
                path: json_result.path,
                name,
                size: json_result.size,
                date_modified,
                is_folder: json_result.is_folder,
            });
        }

        Ok(results)
    }

    /// 解析文本输出（每行一个路径）
    fn parse_text_output(output: &str, max_results: usize) -> Result<Vec<EverythingResult>, EverythingError> {
        let mut results = Vec::new();

        for line in output.lines() {
            if results.len() >= max_results {
                break;
            }

            let path = line.trim();
            if path.is_empty() {
                continue;
            }

            // 跳过帮助文本或错误信息
            if path.starts_with("Everything.exe")
                || path.starts_with("Usage:")
                || path.starts_with("Command Line Options")
                || path.starts_with("-")
                || path.contains("[filename]")
                || path.contains("[-options]") {
                continue;
            }

            // 检查路径是否存在
            let path_buf = std::path::Path::new(path);
            if !path_buf.exists() {
                continue;
            }

            let name = path_buf
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path)
                .to_string();

            let metadata = std::fs::metadata(path).ok();
            let size = metadata.as_ref().and_then(|m| {
                if m.is_file() {
                    Some(m.len())
                } else {
                    None
                }
            });

            let date_modified = metadata.as_ref().and_then(|m| {
                m.modified().ok().and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| {
                        d.as_secs().to_string()
                    })
                })
            });

            let is_folder = metadata.as_ref().map(|m| m.is_dir());

            results.push(EverythingResult {
                path: path.to_string(),
                name,
                size,
                date_modified,
                is_folder,
            });
        }

        Ok(results)
    }

    /// 获取 es.exe 路径
    pub fn get_everything_path() -> Option<PathBuf> {
        find_everything_exe()
    }
}
