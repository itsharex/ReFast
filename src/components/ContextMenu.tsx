import { useRef, useEffect } from "react";
import type { SearchResult } from "../utils/resultUtils";
import { tauriApi } from "../api/tauri";

interface ContextMenuProps {
  menu: { x: number; y: number; result: SearchResult } | null;
  onClose: () => void;
  onRevealInFolder: () => Promise<void>;
  onDebugAppIcon: (appName: string) => Promise<void>;
  onDebugFileIcon: (fileName: string, filePath: string) => Promise<void>;
  onEditMemo: () => void;
  onDeleteMemo: (memoId: string) => Promise<void>;
  onOpenUrl: (url: string) => Promise<void>;
  onCopyJson: (json: string) => Promise<void>;
  onCopyAiAnswer: (answer: string) => Promise<void>;
  query: string;
  selectedMemoId: string | null;
  onRefreshMemos: () => Promise<void>;
  onCloseMemoModal: () => void;
  tauriApi: typeof tauriApi;
}

export function ContextMenu({
  menu,
  onClose,
  onRevealInFolder,
  onDebugAppIcon,
  onDebugFileIcon,
  onEditMemo,
  onDeleteMemo,
  onOpenUrl,
  onCopyJson,
  onCopyAiAnswer,
  query: _query,
  selectedMemoId,
  onRefreshMemos,
  onCloseMemoModal,
  tauriApi,
}: ContextMenuProps) {
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (menu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [menu, onClose]);

  if (!menu) return null;

  // 检查是否有菜单项需要显示
  const hasFileMenu =
    menu.result.type === "file" ||
    menu.result.type === "everything" ||
    menu.result.type === "app";
  const hasMemoMenu = menu.result.type === "memo" && menu.result.memo;
  const hasUrlMenu = menu.result.type === "url" && menu.result.url;
  const hasJsonMenu = menu.result.type === "json_formatter" && menu.result.jsonContent;
  const hasAiMenu = menu.result.type === "ai" && menu.result.aiAnswer;

  // 如果没有菜单项，不显示菜单
  if (!hasFileMenu && !hasMemoMenu && !hasUrlMenu && !hasJsonMenu && !hasAiMenu) {
    return null;
  }

  const handleDeleteMemoClick = async () => {
    if (!menu.result.memo) return;
    if (!confirm("确定要删除这条备忘录吗？")) {
      onClose();
      return;
    }
    try {
      await onDeleteMemo(menu.result.memo.id);
      await onRefreshMemos();
      onClose();
      // 如果删除的是当前显示的备忘录，关闭弹窗
      if (selectedMemoId === menu.result.memo.id) {
        onCloseMemoModal();
      }
    } catch (error) {
      console.error("Failed to delete memo:", error);
      alert(`删除备忘录失败: ${error}`);
      onClose();
    }
  };

  return (
    <div
      ref={contextMenuRef}
      className="fixed bg-white border border-gray-200 text-gray-800 rounded-lg shadow-xl py-1 min-w-[160px] z-50"
      style={{
        left: `${menu.x}px`,
        top: `${menu.y}px`,
      }}
    >
      {hasFileMenu && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRevealInFolder();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
          >
            打开所在文件夹
          </button>
          {/* 为应用类型显示调试图标按钮 */}
          {menu.result.type === "app" && menu.result.app && (
            <button
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                const app = menu.result.app!;
                const hasIcon = app.icon && app.icon.trim() !== "";
                await onDebugAppIcon(app.name);
                // 显示详细信息
                try {
                  const result = await tauriApi.debugAppIcon(app.name);
                  console.log("=== 图标调试结果 ===");
                  console.log("应用名称:", app.name);
                  console.log("应用路径:", app.path);
                  console.log("当前图标状态:", hasIcon ? "有图标" : "无图标");
                  console.log("图标数据长度:", app.icon?.length || 0);
                  console.log("调试信息:\n", result);
                  alert(
                    `应用: ${app.name}\n路径: ${app.path}\n图标状态: ${hasIcon ? "有图标" : "无图标"}\n\n${result}`
                  );
                } catch (error: any) {
                  console.error("调试失败:", error);
                  alert(`调试失败: ${error?.message || error}`);
                }
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors border-t border-gray-100"
            >
              调试图标提取
            </button>
          )}
          {/* 为文件类型（.lnk 或 .exe）也显示调试图标按钮 */}
          {menu.result.type === "file" && menu.result.file && (() => {
            const filePath = menu.result.file.path || "";
            const isLnkOrExe =
              filePath.toLowerCase().endsWith(".lnk") || filePath.toLowerCase().endsWith(".exe");
            const fileName = menu.result.file.name || "";
            return isLnkOrExe ? (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                  try {
                    await onDebugFileIcon(
                      fileName.replace(/\.(lnk|exe)$/i, ""),
                      filePath
                    );
                  } catch (error: any) {
                    console.error("调试失败:", error);
                    alert(`调试失败: ${error?.message || error}`);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors border-t border-gray-100"
              >
                调试图标提取
              </button>
            ) : null;
          })()}
        </>
      )}
      {hasMemoMenu && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditMemo();
              onClose();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
          >
            编辑备忘录
          </button>
          <button
            onClick={handleDeleteMemoClick}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            删除备忘录
          </button>
        </>
      )}
      {hasUrlMenu && (
        <button
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await onOpenUrl(menu.result.url!);
              onClose();
            } catch (error) {
              console.error("Failed to open URL:", error);
              alert(`打开链接失败: ${error}`);
              onClose();
            }
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
        >
          打开链接
        </button>
      )}
      {hasJsonMenu && (
        <button
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await onCopyJson(menu.result.jsonContent!);
              onClose();
            } catch (error) {
              console.error("Failed to copy JSON:", error);
              alert("复制失败，请手动复制");
              onClose();
            }
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
        >
          复制 JSON
        </button>
      )}
      {hasAiMenu && (
        <button
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await onCopyAiAnswer(menu.result.aiAnswer!);
              onClose();
            } catch (error) {
              console.error("Failed to copy AI answer:", error);
              alert("复制失败，请手动复制");
              onClose();
            }
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
        >
          复制回答
        </button>
      )}
    </div>
  );
}

