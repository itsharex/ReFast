import { tauriApi } from "../api/tauri";

export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number; // Unix timestamp
  title?: string; // Markdown 文件标题（从内容中提取）
}

/**
 * 获取最近打开的文件列表（从后端）
 */
export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    return await tauriApi.getMarkdownRecentFiles();
  } catch (error) {
    console.error("读取最近文件记录失败:", error);
    return [];
  }
}

/**
 * 添加文件到最近打开列表（保存到后端）
 * @param filePath 文件路径
 * @param content 可选的 Markdown 文件内容，用于提取标题
 */
export async function addRecentFile(filePath: string, content?: string): Promise<void> {
  try {
    if (content) {
      await tauriApi.addMarkdownRecentFileWithContent(filePath, content);
    } else {
      await tauriApi.addMarkdownRecentFile(filePath);
    }
  } catch (error) {
    console.error("保存最近文件记录失败:", error);
  }
}

/**
 * 从最近打开列表中移除文件（从后端删除）
 */
export async function removeRecentFile(filePath: string): Promise<void> {
  try {
    await tauriApi.removeMarkdownRecentFile(filePath);
  } catch (error) {
    console.error("删除最近文件记录失败:", error);
  }
}

