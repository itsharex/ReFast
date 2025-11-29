use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EverythingResult {
    pub path: String,
    pub name: String,
    pub size: Option<u64>,
    pub date_modified: Option<String>,
}

#[cfg(target_os = "windows")]
pub mod windows {
    use super::*;
    use std::time::Duration;

    // Common Everything installation paths
    const EVERYTHING_PATHS: &[&str] = &[
        r"C:\Program Files\Everything\es.exe",
        r"C:\Program Files (x86)\Everything\es.exe",
        r"C:\Tools\Everything\es.exe",
        r"C:\Everything\es.exe",
    ];

    // Try to find Everything executable
    fn find_everything_exe() -> Option<PathBuf> {
        // First, try common installation paths
        for path in EVERYTHING_PATHS {
            let exe_path = PathBuf::from(path);
            if exe_path.exists() {
                return Some(exe_path);
            }
        }

        // Try to find in PATH
        if let Ok(output) = Command::new("where")
            .arg("es.exe")
            .output()
        {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path_str.is_empty() {
                    return Some(PathBuf::from(path_str));
                }
            }
        }

        None
    }

    // Check if Everything is available
    pub fn is_everything_available() -> bool {
        find_everything_exe().is_some()
    }

    // Search files using Everything
    pub fn search_files(query: &str, max_results: usize) -> Result<Vec<EverythingResult>, String> {
        let everything_exe = find_everything_exe()
            .ok_or_else(|| "Everything (es.exe) not found. Please install Everything or add it to PATH.".to_string())?;

        // Build command: es.exe -name <query> -max-results <max>
        // -name: search by filename
        // -max-results: limit results
        // -format: output format (we'll parse CSV-like output)
        let output = Command::new(&everything_exe)
            .args(&[
                "-name", query,
                "-max-results", &max_results.to_string(),
                "-format", "csv", // CSV format: path,size,date_modified
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute Everything: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Everything command failed: {}", stderr));
        }

        // Parse output (one path per line)
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut results = Vec::new();

        for line in stdout.lines() {
            let path = line.trim();
            if path.is_empty() {
                continue;
            }

            // Extract filename from path
            let name = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path)
                .to_string();

            // Try to get file metadata (size, date modified)
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

            results.push(EverythingResult {
                path: path.to_string(),
                name,
                size,
                date_modified,
            });
        }

        Ok(results)
    }

    // Search with timeout (to prevent hanging)
    pub fn search_files_with_timeout(
        query: &str,
        max_results: usize,
        _timeout: Duration,
    ) -> Result<Vec<EverythingResult>, String> {
        // For timeout, we'd need to use a thread with timeout
        // For now, just use the regular search
        // TODO: Implement proper timeout mechanism
        search_files(query, max_results)
    }
}

#[cfg(not(target_os = "windows"))]
pub mod windows {
    use super::*;
    pub fn is_everything_available() -> bool {
        false
    }
    pub fn search_files(_query: &str, _max_results: usize) -> Result<Vec<EverythingResult>, String> {
        Err("Everything is only available on Windows".to_string())
    }
}

