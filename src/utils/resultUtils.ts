/**
 * 结果处理工具函数
 * 封装结果清空、索引重置等重复逻辑
 */

// SearchResult 类型定义（与 LauncherWindow.tsx 中的定义保持一致）
export type SearchResult = {
  type: "app" | "file" | "everything" | "url" | "email" | "memo" | "plugin" | "system_folder" | "history" | "ai" | "json_formatter" | "settings";
  app?: any;
  file?: any;
  everything?: any;
  url?: string;
  email?: string;
  memo?: any;
  plugin?: { id: string; name: string; description?: string };
  systemFolder?: any;
  aiAnswer?: string;
  jsonContent?: string;
  displayName: string;
  path: string;
};

/**
 * 清空所有结果状态
 */
export interface ClearResultsOptions {
  setResults: (results: SearchResult[]) => void;
  setHorizontalResults: (results: SearchResult[]) => void;
  setVerticalResults: (results: SearchResult[]) => void;
  setSelectedHorizontalIndex: (index: number | null) => void;
  setSelectedVerticalIndex: (index: number | null) => void;
  horizontalResultsRef?: React.MutableRefObject<SearchResult[]>;
  currentLoadResultsRef?: React.MutableRefObject<SearchResult[]>;
  logMessage?: string;
}

export function clearAllResults(options: ClearResultsOptions): void {
  options.setResults([]);
  options.setHorizontalResults([]);
  options.setVerticalResults([]);
  options.setSelectedHorizontalIndex(null);
  options.setSelectedVerticalIndex(null);
  
  if (options.horizontalResultsRef) {
    options.horizontalResultsRef.current = [];
  }
  
  if (options.currentLoadResultsRef) {
    options.currentLoadResultsRef.current = [];
  }
  
  if (options.logMessage) {
    console.log(options.logMessage);
  }
}

/**
 * 重置选中索引
 */
export function resetSelectedIndices(
  setSelectedHorizontalIndex: (index: number | null) => void,
  setSelectedVerticalIndex: (index: number | null) => void
): void {
  setSelectedHorizontalIndex(null);
  setSelectedVerticalIndex(null);
}

/**
 * 选中第一个横向结果
 */
export function selectFirstHorizontal(
  setSelectedHorizontalIndex: (index: number | null) => void,
  setSelectedVerticalIndex: (index: number | null) => void
): void {
  setSelectedHorizontalIndex(0);
  setSelectedVerticalIndex(null);
}

/**
 * 选中第一个纵向结果
 */
export function selectFirstVertical(
  setSelectedHorizontalIndex: (index: number | null) => void,
  setSelectedVerticalIndex: (index: number | null) => void
): void {
  setSelectedHorizontalIndex(null);
  setSelectedVerticalIndex(0);
}

