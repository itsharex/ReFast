import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { plugins } from "../plugins";

export function PluginListWindow() {
  const handleClose = async () => {
    const window = getCurrentWindow();
    await window.close();
  };

  // ESC 键处理
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        await handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-800">插件列表</h2>
        <button
          onClick={handleClose}
          className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          关闭
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3 max-w-4xl mx-auto">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="p-4 border border-gray-200 rounded-lg hover:bg-white transition-colors bg-white"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 bg-green-100">
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800">{plugin.name}</div>
                  {plugin.description && (
                    <div className="text-sm text-gray-500 mt-1">{plugin.description}</div>
                  )}
                  {plugin.keywords && plugin.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {plugin.keywords.map((keyword, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

