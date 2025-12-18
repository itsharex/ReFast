# 性能修复与卡死问题解决方案

## 📋 问题概述

从 31 版本升级到 33 版本后，用户报告了以下问题：
1. 程序无法打开
2. 重装 33 版本后可以打开，但**应用中心卡死**
3. 特别是打开"数据管理"页面时容易出现卡死

## 🔍 根本原因分析

### 1. **同步数据库操作阻塞主线程**

**问题代码**：`src-tauri/src/commands.rs` 中的 `get_index_status` 函数

```rust
pub fn get_index_status(app: tauri::AppHandle) -> Result<IndexStatus, String> {
    // ... 
    let history_total = file_history::get_history_count(&app_data_dir)?;
    // ^^^ 这里直接调用数据库查询，没有使用 spawn_blocking
}
```

**影响**：
- 如果数据库被锁定（例如旧版本程序未正常退出）
- 如果数据库文件损坏
- 如果磁盘 I/O 很慢

这个函数会**永久阻塞** Tauri 主线程，导致整个应用无响应。

### 2. **前端缺少超时保护**

**问题代码**：`src/components/AppIndexList.tsx` 中的 `loadAppIndexList` 函数

```typescript
const data = await tauriApi.scanApplications();
// ^^^ 没有任何超时保护
```

**影响**：
- 如果后端扫描应用过程中卡住（例如遍历网络路径或权限问题）
- 前端会永久等待，用户无法得到任何反馈

### 3. **数据库操作没有超时限制**

**问题代码**：`src-tauri/src/file_history.rs` 中的 `get_history_count` 函数

```rust
pub fn get_history_count(app_data_dir: &Path) -> Result<usize, String> {
    let conn = db::get_connection(app_data_dir)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM file_history", [], |row| row.get(0))?;
    Ok(count as usize)
}
```

**影响**：
- SQLite 连接可能因为文件锁而永久等待
- 没有超时机制，会一直阻塞

### 4. **备份相关操作都是同步函数**

**问题代码**：
- `list_backups` - 遍历备份目录
- `backup_database` - 复制数据库文件
- `restore_backup` - 还原数据库文件
- `delete_backup` - 删除备份文件

```rust
// 全部都是同步函数，会阻塞主线程
pub fn list_backups(...) { fs::read_dir(&backup_dir)... }
pub fn backup_database(...) { fs::copy(&db_path, &backup_path)... }
pub fn restore_backup(...) { fs::copy(&target, &db_path)... }
pub fn delete_backup(...) { fs::remove_file(&target)... }
```

**影响**：
- 如果备份文件很多（50+ 个），遍历会卡顿
- 如果数据库文件很大（50MB+），复制/删除会明显卡顿
- 用户体验很差，感觉程序"死机"

## ✅ 修复方案

### 1. **将 `get_index_status` 改为异步并使用 `spawn_blocking`**

```rust
pub async fn get_index_status(app: tauri::AppHandle) -> Result<IndexStatus, String> {
    async_runtime::spawn_blocking(move || {
        // ... 所有阻塞操作都在这里
        // 使用 unwrap_or(0) 避免数据库错误导致整个函数失败
        let history_total = file_history::get_history_count(&app_data_dir).unwrap_or(0);
        // ...
    })
    .await
    .map_err(|e| format!("get_index_status join error: {}", e))?
}
```

**好处**：
- 不再阻塞主线程
- 即使数据库操作失败，也不会导致整个应用卡死

### 2. **为 `get_history_count` 添加超时保护**

```rust
pub fn get_history_count(app_data_dir: &Path) -> Result<usize, String> {
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;
    
    let (tx, rx) = mpsc::channel();
    let app_data_dir_owned = app_data_dir.to_path_buf();
    
    // 在独立线程中执行数据库操作
    thread::spawn(move || {
        let result = (|| -> Result<usize, String> {
            let conn = db::get_connection(&app_data_dir_owned)?;
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM file_history", [], |row| row.get(0))?;
            Ok(count as usize)
        })();
        let _ = tx.send(result);
    });
    
    // 等待结果，最多 3 秒超时
    match rx.recv_timeout(Duration::from_secs(3)) {
        Ok(result) => result,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            Err("Database query timeout (possible lock)".to_string())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("Database query thread disconnected".to_string())
        }
    }
}
```

**好处**：
- 3 秒超时保护
- 即使数据库被锁定，也会返回错误而不是永久等待
- 前端可以显示友好的错误信息

### 3. **前端添加超时保护**

```typescript
// 超时保护辅助函数
const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
};

// 使用超时保护
const data = await withTimeout(
  tauriApi.scanApplications(),
  30000, // 30 秒超时
  "加载应用列表超时，请检查系统状态或重试"
);
```

**好处**：
- 30 秒超时，用户不会永久等待
- 显示清晰的错误信息

### 4. **将所有备份操作改为异步**

```rust
// ✅ 修复后：所有备份操作都使用 spawn_blocking

#[tauri::command]
pub async fn list_backups(app: tauri::AppHandle) -> Result<DatabaseBackupList, String> {
    async_runtime::spawn_blocking(move || {
        // 遍历目录在后台线程执行
        for entry in fs::read_dir(&backup_dir) { ... }
    }).await?
}

#[tauri::command]
pub async fn backup_database(app: tauri::AppHandle) -> Result<String, String> {
    async_runtime::spawn_blocking(move || {
        // 文件复制在后台线程执行，不阻塞 UI
        fs::copy(&db_path, &backup_path)?;
    }).await?
}

#[tauri::command]
pub async fn restore_backup(app: tauri::AppHandle, path: String) -> Result<String, String> {
    async_runtime::spawn_blocking(move || {
        // 文件复制在后台线程执行，不阻塞 UI
        fs::copy(&target, &db_path)?;
    }).await?
}
```

**好处**：
- 即使备份文件很多，UI 也不会卡顿
- 即使数据库很大（几十MB），复制时 UI 依然流畅
- 用户可以在操作进行时继续使用其他功能

### 5. **添加数据库健康检查功能**

新增 `check_database_health` 命令，在打开数据管理页面时自动检查：

```rust
#[tauri::command]
pub async fn check_database_health(app: tauri::AppHandle) -> Result<DatabaseHealthStatus, String> {
    // 带超时的健康检查
    // 返回：是否可访问、错误信息、数据库路径、表记录数等
}
```

**好处**：
- 提前发现数据库问题
- 在 UI 上显示清晰的警告和解决方案
- 用户知道如何修复问题

## 🎯 用户修复指南

如果遇到应用中心卡死，请按以下步骤操作：

### 方法 1：清理进程（推荐首选）

1. **关闭所有 re-fast 窗口**
2. **打开任务管理器**（Ctrl + Shift + Esc）
3. **查找并结束所有 `re-fast.exe` 进程**
4. **重新启动程序**

### 方法 2：清理数据库文件（会丢失历史数据）

1. **完全退出程序**
2. **打开文件资源管理器，输入地址**：
   ```
   %APPDATA%\re-fast\
   ```
3. **备份以下文件**（如果需要保留数据）：
   - `re-fast.db`
   - `re-fast.db-shm`
   - `re-fast.db-wal`
4. **删除或重命名这些文件**
5. **重新启动程序**（会自动创建新的数据库）

### 方法 3：检查数据库锁定

1. **打开命令提示符**（以管理员身份）
2. **运行以下命令**查看哪个进程占用数据库：
   ```cmd
   handle.exe "%APPDATA%\re-fast\re-fast.db"
   ```
   （需要下载 [Sysinternals Handle](https://docs.microsoft.com/en-us/sysinternals/downloads/handle)）
3. **结束占用进程**

### 方法 4：使用备份恢复

如果之前有备份：
1. **打开应用中心 → 数据管理**
2. **查看"数据库备份"部分**
3. **选择最近的备份并点击"还原"**

## 📊 性能改进总结

| 修改项 | 修改前 | 修改后 | 改进效果 |
|--------|--------|--------|----------|
| `get_index_status` | 同步函数，阻塞主线程 | 异步 + spawn_blocking | ✅ 不再阻塞 UI |
| `get_history_count` | 无超时限制 | 3 秒超时 | ✅ 避免永久等待 |
| `scanApplications` 调用 | 无超时保护 | 30 秒超时 | ✅ 用户体验改善 |
| `list_backups` | 同步函数，遍历目录 | 异步 + spawn_blocking | ✅ 避免阻塞（特别是备份文件多时） |
| `backup_database` | 同步函数，复制文件 | 异步 + spawn_blocking | ✅ 避免大文件复制时卡死 |
| `restore_backup` | 同步函数，复制文件 | 异步 + spawn_blocking | ✅ 避免还原时卡死 |
| `delete_backup` | 同步函数，删除文件 | 异步 + spawn_blocking | ✅ 提升响应性 |
| 数据库健康检查 | 无 | 自动检查 + UI 警告 | ✅ 提前发现问题 |

## 🔧 开发者注意事项

### 未来需要遵循的原则

1. **所有 I/O 操作都应使用 `spawn_blocking`**
   ```rust
   // ❌ 错误
   #[tauri::command]
   pub fn my_command() -> Result<Data, String> {
       let conn = db::get_connection()?; // 阻塞主线程
       // ...
   }
   
   // ✅ 正确
   #[tauri::command]
   pub async fn my_command() -> Result<Data, String> {
       async_runtime::spawn_blocking(move || {
           let conn = db::get_connection()?;
           // ...
       }).await?
   }
   ```

2. **所有数据库操作都应有超时保护**
   ```rust
   // 使用 mpsc::channel + recv_timeout
   // 或使用 tokio::time::timeout
   ```

3. **前端所有后端调用都应有超时保护**
   ```typescript
   // 使用 Promise.race + setTimeout
   const withTimeout = <T,>(promise: Promise<T>, ms: number, msg: string) => {
       return Promise.race([
           promise,
           new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
       ]);
   };
   ```

4. **在 UI 显示清晰的错误信息和解决方案**
   - 不只是说"失败了"
   - 告诉用户为什么失败、如何修复

## 🚀 后续优化建议

1. **添加数据库连接池**
   - 避免频繁打开/关闭连接
   - 提高性能

2. **添加数据库自动修复**
   - 检测到损坏时自动尝试修复
   - 或提示用户恢复备份

3. **添加性能监控**
   - 记录慢查询
   - 记录超时事件
   - 帮助发现性能瓶颈

4. **优化应用扫描**
   - 增量扫描而不是全量扫描
   - 缓存扫描结果
   - 后台异步扫描

## 📝 测试清单

- [ ] 正常启动程序
- [ ] 打开应用中心不卡死
- [ ] 打开数据管理页面不卡死
- [ ] 数据库健康检查显示正常
- [ ] 模拟数据库锁定，显示警告
- [ ] 超时后能正常恢复
- [ ] 扫描应用不会永久阻塞
- [ ] 从旧版本升级正常

## 📅 版本历史

- **v1.0.33** - 发现卡死问题
- **v1.0.34** (待发布) - 修复所有卡死问题

---

**注意**：这些修复已经应用到代码中，需要重新编译并测试。
