import { useState, useEffect, useRef, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useWindowClose } from "../hooks/useWindowClose";
import { tauriApi } from "../api/tauri";
import { getRecentFiles, addRecentFile, removeRecentFile, type RecentFile } from "../utils/markdownEditorHistory";

interface Heading {
  level: number;
  text: string;
  id: string;
}

export function MarkdownEditorWindow() {
  const [markdownContent, setMarkdownContent] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "edit" | "split">("preview");
  const [isWatching, setIsWatching] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [showRecentFiles, setShowRecentFiles] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const isEditingRef = useRef(false); // 标记是否正在编辑，避免外部变化触发时覆盖用户输入
  const isScrollingRef = useRef(false); // 标记是否正在进行程序化滚动
  const recentFilesRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // ESC 键关闭窗口
  const handleClose = useWindowClose();
  useEscapeKey(handleClose);

  // 加载最近打开的文件列表
  useEffect(() => {
    const loadRecentFiles = async () => {
      const files = await getRecentFiles();
      setRecentFiles(files);
    };
    loadRecentFiles();
  }, []);

  // 打开文件的通用函数
  const openFileByPath = async (filePath: string, fileName?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // 先停止之前的监听
      if (filePath) {
        try {
          const window = getCurrentWindow();
          await tauriApi.unwatchMarkdownFile(window.label, filePath);
        } catch (e) {
          console.warn("停止文件监听失败:", e);
        }
      }

      // 读取文件内容（这是关键操作，失败才显示错误）
      let content: string;
      try {
        content = await invoke<string>("read_text_file", { path: filePath });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "读取文件失败";
        setError(`无法读取文件: ${errorMessage}`);
        console.error("读取文件失败:", err);
        setIsLoading(false);
        setIsWatching(false);
        return false;
      }

      // 文件读取成功，更新状态
      setMarkdownContent(content);
      setFilePath(filePath);
      
      // 保存到最近打开的文件记录（非关键操作，失败不影响）
      // 传递文件内容以提取标题
      try {
        await addRecentFile(filePath, content);
        const files = await getRecentFiles();
        setRecentFiles(files);
      } catch (e) {
        console.warn("保存最近文件记录失败:", e);
      }
      
      // 更新窗口标题（非关键操作，失败不影响）
      try {
        const window = getCurrentWindow();
        const displayName = fileName || filePath.split(/[/\\]/).pop() || "未命名";
        await window.setTitle(`Markdown 编辑器 - ${displayName}`);
      } catch (e) {
        console.warn("更新窗口标题失败:", e);
      }
      
      // 开始监听文件变化（非关键操作，失败不影响）
      try {
        const window = getCurrentWindow();
        await tauriApi.watchMarkdownFile(window.label, filePath);
        setIsWatching(true);
        console.log("开始监听文件变化:", filePath);
      } catch (e) {
        console.warn("启动文件监听失败:", e);
        setIsWatching(false);
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "打开文件失败";
      setError(`无法打开文件: ${errorMessage}`);
      console.error("打开文件失败:", err);
      setIsLoading(false);
      setIsWatching(false);
      return false;
    }
  };

  // 组件加载时自动打开上次打开的文件
  useEffect(() => {
    const autoLoadLastFile = async () => {
      // 如果已经有文件打开，不自动加载
      if (filePath) return;

      try {
        const files = await getRecentFiles();
        if (files.length > 0) {
          const lastFile = files[0]; // 第一个是最新的
          console.log("自动加载上次打开的文件:", lastFile.path);
          const success = await openFileByPath(lastFile.path, lastFile.title || lastFile.name);
          
          // 如果文件不存在，从列表中移除
          if (!success) {
            try {
              await removeRecentFile(lastFile.path);
              const updatedFiles = await getRecentFiles();
              setRecentFiles(updatedFiles);
            } catch (e) {
              console.warn("移除无效文件记录失败:", e);
            }
          }
        }
      } catch (error) {
        console.error("自动加载上次文件失败:", error);
        // 静默失败，不影响用户体验
      }
    };

    // 延迟一小段时间，确保组件完全加载
    const timer = setTimeout(() => {
      autoLoadLastFile();
    }, 100);

    return () => clearTimeout(timer);
  }, []); // 只在组件挂载时执行一次

  // 监听文件变化事件
  useEffect(() => {
    const autoLoadLastFile = async () => {
      // 如果已经有文件打开，不自动加载
      if (filePath) return;

      try {
        const files = await getRecentFiles();
        if (files.length > 0) {
          const lastFile = files[0]; // 第一个是最新的
          console.log("自动加载上次打开的文件:", lastFile.path);
          const success = await openFileByPath(lastFile.path, lastFile.title || lastFile.name);
          
          // 如果文件不存在，从列表中移除
          if (!success) {
            try {
              await removeRecentFile(lastFile.path);
              const updatedFiles = await getRecentFiles();
              setRecentFiles(updatedFiles);
            } catch (e) {
              console.warn("移除无效文件记录失败:", e);
            }
          }
        }
      } catch (error) {
        console.error("自动加载上次文件失败:", error);
        // 静默失败，不影响用户体验
      }
    };

    // 延迟一小段时间，确保组件完全加载
    const timer = setTimeout(() => {
      autoLoadLastFile();
    }, 100);

    return () => clearTimeout(timer);
  }, []); // 只在组件挂载时执行一次

  // 点击外部关闭最近文件菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recentFilesRef.current && !recentFilesRef.current.contains(event.target as Node)) {
        setShowRecentFiles(false);
      }
    };

    if (showRecentFiles) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showRecentFiles]);

  // 生成标题 ID（简单的 slug）
  const generateSlug = (text: string): string => {
    let slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
    
    // 确保不以数字开头（CSS 选择器不允许）
    if (/^\d/.test(slug)) {
      slug = `h-${slug}`;
    }
    
    // 确保不以连字符结尾
    slug = slug.replace(/-+$/, "");
    
    // 如果为空，使用默认值
    if (!slug) {
      slug = "heading";
    }
    
    return slug;
  };

  // 提取 Markdown 中的所有标题
  const headings = useMemo<Heading[]>(() => {
    if (!markdownContent) return [];
    
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const headingsList: Heading[] = [];
    const idMap = new Map<string, number>();
    let match;

    while ((match = headingRegex.exec(markdownContent)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      let baseId = generateSlug(text);
      
      // 如果 ID 已存在，添加数字后缀
      if (idMap.has(baseId)) {
        const count = idMap.get(baseId)! + 1;
        idMap.set(baseId, count);
        baseId = `${baseId}-${count}`;
      } else {
        idMap.set(baseId, 0);
      }
      
      headingsList.push({ level, text, id: baseId });
    }

    return headingsList;
  }, [markdownContent]);

  // 监听滚动，高亮当前标题
  useEffect(() => {
    if (viewMode === "edit" || !previewRef.current || headings.length === 0) return;

    const previewElement = previewRef.current;
    const handleScroll = () => {
      // 如果正在进行程序化滚动，忽略滚动监听器的更新
      if (isScrollingRef.current) return;
      
      const scrollTop = previewElement.scrollTop;
      const headingsElements = previewElement.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
      
      let currentHeadingId: string | null = null;
      
      for (let i = headingsElements.length - 1; i >= 0; i--) {
        const element = headingsElements[i] as HTMLElement;
        if (element.offsetTop - scrollTop <= 100) {
          currentHeadingId = element.id;
          break;
        }
      }
      
      setActiveHeadingId(currentHeadingId);
    };

    previewElement.addEventListener("scroll", handleScroll);
    handleScroll(); // 初始检查

    return () => {
      previewElement.removeEventListener("scroll", handleScroll);
    };
  }, [markdownContent, viewMode, headings]);

  // 滚动到指定标题
  const scrollToHeading = (id: string) => {
    if (!previewRef.current) return;
    
    // 首先尝试使用 getElementById（更安全，不依赖 CSS 选择器）
    let element = document.getElementById(id) as HTMLElement;
    
    // 如果找不到，尝试在预览容器内查找
    if (!element && previewRef.current) {
      // 使用 getElementById 在整个文档中查找
      element = previewRef.current.querySelector(`[id="${id}"]`) as HTMLElement;
    }
    
    // 如果还是找不到，尝试通过文本内容查找
    if (!element) {
      const heading = headings.find(h => h.id === id);
      if (heading) {
        const allHeadings = previewRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (const h of Array.from(allHeadings)) {
          if (h.textContent?.trim() === heading.text) {
            element = h as HTMLElement;
            // 如果元素没有 ID，设置它
            if (!element.id) {
              element.id = id;
            }
            break;
          }
        }
      }
    }
    
    if (element) {
      // 立即设置高亮
      setActiveHeadingId(id);
      
      // 标记开始程序化滚动，防止滚动监听器在滚动过程中覆盖高亮
      isScrollingRef.current = true;
      
      // 滚动到目标位置
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      
      // 等待滚动完成后再允许滚动监听器更新高亮
      // 平滑滚动通常需要 300-500ms，我们设置 600ms 以确保滚动完成
      setTimeout(() => {
        isScrollingRef.current = false;
        // 滚动完成后，确保高亮正确（滚动监听器会基于实际位置更新）
        // 但为了确保点击的标题被高亮，我们再次设置它
        setActiveHeadingId(id);
      }, 600);
    } else {
      console.warn(`找不到标题元素: ${id}`);
    }
  };

  // 监听文件变化事件
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<string>("markdown-file-changed", (event) => {
          // 如果用户正在编辑，不自动更新（避免覆盖用户输入）
          if (!isEditingRef.current && filePath) {
            console.log("检测到文件变化，自动更新内容");
            setMarkdownContent(event.payload);
          }
        });
      } catch (error) {
        console.error("设置文件监听失败:", error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [filePath]);

  // 打开文件
  const handleOpenFile = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const selected = await open({
        filters: [
          {
            name: "Markdown",
            extensions: ["md", "markdown", "txt"],
          },
        ],
        multiple: false,
        title: "打开 Markdown 文件",
      });

      // 用户取消选择文件，不显示错误
      if (!selected || typeof selected !== "string") {
        setIsLoading(false);
        return;
      }

      // 使用通用函数打开文件
      await openFileByPath(selected);
    } catch (err) {
      // 只有在文件对话框真正出错时才显示错误（用户取消不算错误）
      // 检查错误信息，如果是用户取消相关的错误，不显示
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (!errorMessage.includes("canceled") && !errorMessage.includes("取消")) {
        setError(`无法打开文件: ${errorMessage}`);
        console.error("打开文件失败:", err);
      } else {
        // 用户取消操作，不显示错误
        console.log("用户取消了文件选择");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 清空内容
  const handleClear = async () => {
    // 停止文件监听
    if (filePath) {
      try {
        const window = getCurrentWindow();
        await tauriApi.unwatchMarkdownFile(window.label, filePath);
      } catch (e) {
        console.warn("停止文件监听失败:", e);
      }
    }
    
    setMarkdownContent("");
    setFilePath(null);
    setError(null);
    setIsWatching(false);
    const window = getCurrentWindow();
    window.setTitle("Markdown 编辑器");
  };

  // 快速打开最近文件
  const handleOpenRecentFile = async (recentFile: RecentFile) => {
    setShowRecentFiles(false);
    
    const success = await openFileByPath(recentFile.path, recentFile.title || recentFile.name);
    
    // 如果文件不存在，从最近列表中移除
    if (!success) {
      try {
        await removeRecentFile(recentFile.path);
        const files = await getRecentFiles();
        setRecentFiles(files);
      } catch (e) {
        console.warn("移除无效文件记录失败:", e);
      }
    }
  };

  // 组件卸载时清理监听
  useEffect(() => {
    return () => {
      if (filePath) {
        const window = getCurrentWindow();
        tauriApi.unwatchMarkdownFile(window.label, filePath).catch(console.error);
      }
    };
  }, [filePath]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        backgroundColor: "#ffffff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          padding: "16px 20px",
          backgroundColor: "#f3f4f6",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 600,
            color: "#111827",
          }}
        >
          Markdown 编辑器
        </h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {filePath && (
            <>
              <span
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  marginRight: "8px",
                  maxWidth: "300px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={filePath}
              >
                {filePath.split(/[/\\]/).pop()}
              </span>
              {isWatching && (
                <span
                  style={{
                    fontSize: "11px",
                    color: "#10b981",
                    marginRight: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  title="正在监听文件变化"
                >
                  <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#10b981" }}></span>
                  监听中
                </span>
              )}
            </>
          )}
          <button
            onClick={handleClose}
            style={{
              padding: "6px 12px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#dc2626";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#ef4444";
            }}
          >
            关闭
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div
        style={{
          padding: "12px 20px",
          backgroundColor: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }} ref={recentFilesRef}>
          <button
            onClick={handleOpenFile}
            disabled={isLoading}
            style={{
              padding: "8px 16px",
              backgroundColor: isLoading ? "#9ca3af" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
            onMouseOver={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = "#2563eb";
              }
            }}
            onMouseOut={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = "#3b82f6";
              }
            }}
          >
            {isLoading ? "打开中..." : "打开文件"}
          </button>
          {recentFiles.length > 0 && (
            <>
              <button
                onClick={() => setShowRecentFiles(!showRecentFiles)}
                disabled={isLoading}
                style={{
                  padding: "8px 12px",
                  marginLeft: "4px",
                  backgroundColor: showRecentFiles ? "#2563eb" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
                onMouseOver={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = "#2563eb";
                  }
                }}
                onMouseOut={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = showRecentFiles ? "#2563eb" : "#3b82f6";
                  }
                }}
              >
                ▼
              </button>
              {showRecentFiles && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "4px",
                    backgroundColor: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                    minWidth: "250px",
                    maxWidth: "400px",
                    maxHeight: "300px",
                    overflowY: "auto",
                    zIndex: 1000,
                  }}
                >
                  <div
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    最近打开的文件
                  </div>
                  {recentFiles.map((file) => (
                    <div
                      key={file.path}
                      onClick={() => handleOpenRecentFile(file)}
                      style={{
                        padding: "10px 12px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f3f4f6",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: 500,
                            color: "#111827",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={file.title || file.name}
                        >
                          {file.title || file.name}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#9ca3af",
                            marginTop: "2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={file.path}
                        >
                          {file.title ? file.name : (file.path.length > 50 ? `...${file.path.slice(-47)}` : file.path)}
                        </div>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await removeRecentFile(file.path);
                            const files = await getRecentFiles();
                            setRecentFiles(files);
                          } catch (err) {
                            console.error("删除最近文件记录失败:", err);
                          }
                        }}
                        style={{
                          padding: "4px 8px",
                          marginLeft: "8px",
                          backgroundColor: "transparent",
                          color: "#9ca3af",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 500,
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = "#fee2e2";
                          e.currentTarget.style.color = "#dc2626";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "#9ca3af";
                        }}
                        title="从列表中移除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <button
          onClick={handleClear}
          style={{
            padding: "8px 16px",
            backgroundColor: "#6b7280",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 500,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#4b5563";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#6b7280";
          }}
        >
          清空
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button
            onClick={() => setViewMode("preview")}
            style={{
              padding: "6px 12px",
              backgroundColor: viewMode === "preview" ? "#6366f1" : "#e5e7eb",
              color: viewMode === "preview" ? "white" : "#374151",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            预览
          </button>
          <button
            onClick={() => setViewMode("edit")}
            style={{
              padding: "6px 12px",
              backgroundColor: viewMode === "edit" ? "#6366f1" : "#e5e7eb",
              color: viewMode === "edit" ? "white" : "#374151",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            编辑
          </button>
          <button
            onClick={() => setViewMode("split")}
            style={{
              padding: "6px 12px",
              backgroundColor: viewMode === "split" ? "#6366f1" : "#e5e7eb",
              color: viewMode === "split" ? "white" : "#374151",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            分屏
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div
          style={{
            padding: "12px 20px",
            backgroundColor: "#fee2e2",
            borderBottom: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "14px",
          }}
        >
          <strong>错误:</strong> {error}
        </div>
      )}

      {/* 主内容区 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: viewMode === "split" ? "1px" : "0",
          overflow: "hidden",
        }}
      >
        {/* 编辑区域 */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div
            style={{
              flex: viewMode === "split" ? 1 : "none",
              width: viewMode === "split" ? "auto" : "100%",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#ffffff",
              borderRight: viewMode === "split" ? "1px solid #e5e7eb" : "none",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "#f9fafb",
                borderBottom: "1px solid #e5e7eb",
                fontSize: "13px",
                fontWeight: 500,
                color: "#374151",
              }}
            >
              编辑
            </div>
            <textarea
              value={markdownContent}
              onChange={(e) => {
                isEditingRef.current = true;
                setMarkdownContent(e.target.value);
                // 延迟重置编辑标记，避免快速输入时频繁触发
                setTimeout(() => {
                  isEditingRef.current = false;
                }, 1000);
              }}
              onBlur={() => {
                // 失去焦点时重置编辑标记
                setTimeout(() => {
                  isEditingRef.current = false;
                }, 500);
              }}
              placeholder='在此输入或粘贴 Markdown 内容，或点击上方"打开文件"按钮打开本地文件...'
              style={{
                flex: 1,
                padding: "16px",
                border: "none",
                outline: "none",
                resize: "none",
                fontFamily: "'Courier New', monospace",
                fontSize: "14px",
                lineHeight: "1.6",
                backgroundColor: "#ffffff",
                color: "#111827",
              }}
              spellCheck={false}
            />
          </div>
        )}

        {/* 预览区域 */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div
            style={{
              flex: viewMode === "split" ? 1 : "none",
              width: viewMode === "split" ? "auto" : "100%",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "#f9fafb",
                borderBottom: "1px solid #e5e7eb",
                fontSize: "13px",
                fontWeight: 500,
                color: "#374151",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>预览</span>
              {headings.length > 0 && (
                <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 400 }}>
                  {headings.length} 个标题
                </span>
              )}
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                overflow: "hidden",
              }}
            >
              {/* 侧边导航栏 */}
              {headings.length > 0 && (
                <div
                  style={{
                    width: "200px",
                    backgroundColor: "#f9fafb",
                    borderRight: "1px solid #e5e7eb",
                    overflowY: "auto",
                    padding: "12px",
                    fontSize: "12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#6b7280",
                      marginBottom: "8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    导航
                  </div>
                  {headings.map((heading) => (
                    <div
                      key={heading.id}
                      onClick={() => scrollToHeading(heading.id)}
                      style={{
                        padding: "6px 8px",
                        paddingLeft: `${(heading.level - 1) * 12 + 8}px`,
                        cursor: "pointer",
                        borderRadius: "4px",
                        marginBottom: "2px",
                        color: activeHeadingId === heading.id ? "#3b82f6" : "#374151",
                        backgroundColor: activeHeadingId === heading.id ? "#eff6ff" : "transparent",
                        fontWeight: activeHeadingId === heading.id ? 600 : 400,
                        fontSize: heading.level === 1 ? "13px" : heading.level === 2 ? "12px" : "11px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        transition: "all 0.2s",
                      }}
                      onMouseOver={(e) => {
                        if (activeHeadingId !== heading.id) {
                          e.currentTarget.style.backgroundColor = "#f3f4f6";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (activeHeadingId !== heading.id) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                      title={heading.text}
                    >
                      {heading.text}
                    </div>
                  ))}
                </div>
              )}
              {/* 预览内容 */}
              <div
                ref={previewRef}
                style={{
                  flex: 1,
                  padding: "16px",
                  overflow: "auto",
                  backgroundColor: "#ffffff",
                }}
              >
              {markdownContent ? (
                <div
                  style={{
                    maxWidth: "100%",
                    color: "#111827",
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      // 自定义样式 - 为标题添加 ID 以便导航
                      h1: ({ node, children, ...props }: any) => {
                        // 提取文本内容
                        const extractText = (children: any): string => {
                          if (typeof children === "string") return children;
                          if (Array.isArray(children)) {
                            return children.map(extractText).join("");
                          }
                          if (children?.props?.children) {
                            return extractText(children.props.children);
                          }
                          return "";
                        };
                        const text = extractText(children);
                        const id = generateSlug(text);
                        return (
                          <h1
                            id={id}
                            style={{
                              fontSize: "2em",
                              fontWeight: 700,
                              marginTop: "0.67em",
                              marginBottom: "0.67em",
                              scrollMarginTop: "80px",
                            }}
                            {...props}
                          >
                            {children}
                          </h1>
                        );
                      },
                      h2: ({ node, children, ...props }: any) => {
                        const extractText = (children: any): string => {
                          if (typeof children === "string") return children;
                          if (Array.isArray(children)) {
                            return children.map(extractText).join("");
                          }
                          if (children?.props?.children) {
                            return extractText(children.props.children);
                          }
                          return "";
                        };
                        const text = extractText(children);
                        const heading = headings.find(h => h.text === text.trim());
                        const id = heading?.id || generateSlug(text);
                        return (
                          <h2
                            id={id}
                            style={{
                              fontSize: "1.5em",
                              fontWeight: 700,
                              marginTop: "0.83em",
                              marginBottom: "0.83em",
                              scrollMarginTop: "80px",
                            }}
                            {...props}
                          >
                            {children}
                          </h2>
                        );
                      },
                      h3: ({ node, children, ...props }: any) => {
                        const extractText = (children: any): string => {
                          if (typeof children === "string") return children;
                          if (Array.isArray(children)) {
                            return children.map(extractText).join("");
                          }
                          if (children?.props?.children) {
                            return extractText(children.props.children);
                          }
                          return "";
                        };
                        const text = extractText(children);
                        const heading = headings.find(h => h.text === text.trim());
                        const id = heading?.id || generateSlug(text);
                        return (
                          <h3
                            id={id}
                            style={{
                              fontSize: "1.17em",
                              fontWeight: 700,
                              marginTop: "1em",
                              marginBottom: "1em",
                              scrollMarginTop: "80px",
                            }}
                            {...props}
                          >
                            {children}
                          </h3>
                        );
                      },
                      h4: ({ node, children, ...props }: any) => {
                        const extractText = (children: any): string => {
                          if (typeof children === "string") return children;
                          if (Array.isArray(children)) {
                            return children.map(extractText).join("");
                          }
                          if (children?.props?.children) {
                            return extractText(children.props.children);
                          }
                          return "";
                        };
                        const text = extractText(children);
                        const heading = headings.find(h => h.text === text.trim());
                        const id = heading?.id || generateSlug(text);
                        return (
                          <h4
                            id={id}
                            style={{
                              fontSize: "1em",
                              fontWeight: 700,
                              marginTop: "1em",
                              marginBottom: "1em",
                              scrollMarginTop: "80px",
                            }}
                            {...props}
                          >
                            {children}
                          </h4>
                        );
                      },
                      h5: ({ node, children, ...props }: any) => {
                        const extractText = (children: any): string => {
                          if (typeof children === "string") return children;
                          if (Array.isArray(children)) {
                            return children.map(extractText).join("");
                          }
                          if (children?.props?.children) {
                            return extractText(children.props.children);
                          }
                          return "";
                        };
                        const text = extractText(children);
                        const heading = headings.find(h => h.text === text.trim());
                        const id = heading?.id || generateSlug(text);
                        return (
                          <h5
                            id={id}
                            style={{
                              fontSize: "0.9em",
                              fontWeight: 700,
                              marginTop: "1em",
                              marginBottom: "1em",
                              scrollMarginTop: "80px",
                            }}
                            {...props}
                          >
                            {children}
                          </h5>
                        );
                      },
                      h6: ({ node, children, ...props }: any) => {
                        const extractText = (children: any): string => {
                          if (typeof children === "string") return children;
                          if (Array.isArray(children)) {
                            return children.map(extractText).join("");
                          }
                          if (children?.props?.children) {
                            return extractText(children.props.children);
                          }
                          return "";
                        };
                        const text = extractText(children);
                        const heading = headings.find(h => h.text === text.trim());
                        const id = heading?.id || generateSlug(text);
                        return (
                          <h6
                            id={id}
                            style={{
                              fontSize: "0.85em",
                              fontWeight: 700,
                              marginTop: "1em",
                              marginBottom: "1em",
                              scrollMarginTop: "80px",
                            }}
                            {...props}
                          >
                            {children}
                          </h6>
                        );
                      },
                      p: ({ node, ...props }) => (
                        <p style={{ marginTop: "1em", marginBottom: "1em", lineHeight: "1.6" }} {...props} />
                      ),
                      code: ({ node, inline, ...props }: any) => {
                        if (inline) {
                          return (
                            <code
                              style={{
                                backgroundColor: "#f3f4f6",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontFamily: "'Courier New', monospace",
                                fontSize: "0.9em",
                                color: "#dc2626",
                              }}
                              {...props}
                            />
                          );
                        }
                        return (
                          <code
                            style={{
                              display: "block",
                              backgroundColor: "#f3f4f6",
                              padding: "12px",
                              borderRadius: "6px",
                              fontFamily: "'Courier New', monospace",
                              fontSize: "0.9em",
                              overflow: "auto",
                              marginTop: "1em",
                              marginBottom: "1em",
                            }}
                            {...props}
                          />
                        );
                      },
                      pre: ({ node, ...props }) => (
                        <pre
                          style={{
                            backgroundColor: "#f3f4f6",
                            padding: "12px",
                            borderRadius: "6px",
                            overflow: "auto",
                            marginTop: "1em",
                            marginBottom: "1em",
                          }}
                          {...props}
                        />
                      ),
                      blockquote: ({ node, ...props }) => (
                        <blockquote
                          style={{
                            borderLeft: "4px solid #d1d5db",
                            paddingLeft: "16px",
                            marginLeft: 0,
                            marginTop: "1em",
                            marginBottom: "1em",
                            color: "#6b7280",
                          }}
                          {...props}
                        />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul style={{ marginTop: "1em", marginBottom: "1em", paddingLeft: "2em" }} {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol style={{ marginTop: "1em", marginBottom: "1em", paddingLeft: "2em" }} {...props} />
                      ),
                      li: ({ node, ...props }) => (
                        <li style={{ marginTop: "0.5em", marginBottom: "0.5em" }} {...props} />
                      ),
                      a: ({ node, ...props }: any) => (
                        <a
                          style={{ color: "#3b82f6", textDecoration: "underline" }}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        />
                      ),
                      table: ({ node, ...props }) => (
                        <table
                          style={{
                            borderCollapse: "collapse",
                            width: "100%",
                            marginTop: "1em",
                            marginBottom: "1em",
                          }}
                          {...props}
                        />
                      ),
                      th: ({ node, ...props }) => (
                        <th
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "8px 12px",
                            backgroundColor: "#f9fafb",
                            fontWeight: 600,
                            textAlign: "left",
                          }}
                          {...props}
                        />
                      ),
                      td: ({ node, ...props }) => (
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "8px 12px",
                          }}
                          {...props}
                        />
                      ),
                      hr: ({ node, ...props }) => (
                        <hr
                          style={{
                            border: "none",
                            borderTop: "1px solid #e5e7eb",
                            marginTop: "2em",
                            marginBottom: "2em",
                          }}
                          {...props}
                        />
                      ),
                    }}
                  >
                    {markdownContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <div
                  style={{
                    color: "#9ca3af",
                    textAlign: "center",
                    padding: "40px",
                    fontSize: "14px",
                  }}
                >
                  预览内容将显示在这里...
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

