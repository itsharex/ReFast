import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 窗口关闭 Hook
 * 统一处理窗口关闭逻辑，避免重复代码
 * 
 * @returns 关闭窗口的函数
 * 
 * @example
 * ```tsx
 * function MyWindow() {
 *   const handleClose = useWindowClose();
 *   
 *   return (
 *     <button onClick={handleClose}>关闭</button>
 *   );
 * }
 * ```
 */
export function useWindowClose() {
  return useCallback(async () => {
    const window = getCurrentWindow();
    await window.close();
  }, []);
}

