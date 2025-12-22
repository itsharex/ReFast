/**
 * Launcher 初始化相关的自定义 hooks
 * 负责处理组件挂载时的各种初始化逻辑
 */

import type React from "react";
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { tauriApi } from "../api/tauri";
import type { AppInfo, FileHistoryItem, MemoItem, SearchEngineConfig, PluginContext } from "../types";
import type { ResultStyle } from "../utils/themeConfig";

/**
 * 初始化选项接口
 */
export interface LauncherInitializationOptions {
  // 状态设置函数
  setOllamaSettings: (settings: { model: string; base_url: string }) => void;
  setResultStyle: (style: ResultStyle) => void;
  setCloseOnBlur: (close: boolean) => void;
  setSearchEngines: (engines: SearchEngineConfig[]) => void;
  setIsEverythingAvailable: (available: boolean) => void;
  setEverythingError: (error: string | null) => void;
  setEverythingPath: (path: string | null) => void;
  setEverythingVersion: (version: string | null) => void;
  setMemos: (memos: MemoItem[]) => void;
  setOpenHistory: (history: Record<string, number>) => void;
  setUrlRemarks: (remarks: Record<string, string>) => void;
  setApps: (apps: AppInfo[]) => void;
  setEverythingDownloadProgress: (progress: number) => void;
  
  // Refs
  pendingJsonContentRef: React.MutableRefObject<string | null>;
  allAppsCacheRef: React.MutableRefObject<AppInfo[]>;
  allAppsCacheLoadedRef: React.MutableRefObject<boolean>;
  allFileHistoryCacheRef: React.MutableRefObject<FileHistoryItem[]>;
  allFileHistoryCacheLoadedRef: React.MutableRefObject<boolean>;
  closeOnBlurRef: React.MutableRefObject<boolean>;
  
  // 工具函数
  filterWindowsApps: (apps: AppInfo[]) => AppInfo[];
  
  // 其他依赖
  query: string;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  isDownloadingEverything: boolean;
}

/**
 * Launcher 初始化 hook
 * 处理所有组件挂载时的初始化逻辑
 */
export function useLauncherInitialization(
  options: LauncherInitializationOptions
): void {
  const {
    setOllamaSettings,
    setResultStyle,
    setCloseOnBlur,
    setSearchEngines,
    setIsEverythingAvailable,
    setEverythingError,
    setEverythingPath,
    setEverythingVersion,
    setMemos,
    setOpenHistory,
    setUrlRemarks,
    setApps,
    setEverythingDownloadProgress,
    pendingJsonContentRef,
    allAppsCacheRef,
    allAppsCacheLoadedRef,
    allFileHistoryCacheRef,
    allFileHistoryCacheLoadedRef,
    closeOnBlurRef,
    filterWindowsApps,
    query,
    setQuery,
    setSelectedIndex,
    isDownloadingEverything,
  } = options;

  // Load settings on mount and reload when settings window closes
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await tauriApi.getSettings();
        setOllamaSettings(settings.ollama);
        const styleFromSettings = (settings.result_style as ResultStyle) || null;
        const styleFromCache = localStorage.getItem("result-style");
        const fallback =
          styleFromSettings && ["compact", "soft", "skeuomorphic"].includes(styleFromSettings)
            ? styleFromSettings
            : styleFromCache && ["compact", "soft", "skeuomorphic"].includes(styleFromCache)
            ? (styleFromCache as ResultStyle)
            : "skeuomorphic";
        setResultStyle(fallback);
        localStorage.setItem("result-style", fallback);
        const closeOnBlurSetting = settings.close_on_blur ?? true;
        setCloseOnBlur(closeOnBlurSetting);
        closeOnBlurRef.current = closeOnBlurSetting;
        // 加载搜索引擎配置
        if (settings.search_engines) {
          setSearchEngines(settings.search_engines);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    loadSettings();

    // 监听设置窗口关闭事件，重新加载设置
    const unlisten = listen("settings:updated", () => {
      loadSettings();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setOllamaSettings, setResultStyle, setCloseOnBlur, setSearchEngines, closeOnBlurRef]);

  // 监听 JSON 查看器窗口准备好事件，发送待处理的内容
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlistenFn = await listen("json-formatter:ready", async () => {
          // 窗口已准备好，发送待处理的内容
          if (pendingJsonContentRef.current) {
            const content = pendingJsonContentRef.current;
            pendingJsonContentRef.current = null; // 清空待处理内容

            try {
              const { emit } = await import("@tauri-apps/api/event");
              await emit("json-formatter:set-content", content);
            } catch (error) {
              console.error("Failed to send JSON content to formatter window:", error);
            }
          }
        });
      } catch (error) {
        console.error("Failed to setup JSON formatter ready listener:", error);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [pendingJsonContentRef]);

  // Check if Everything is available on mount and periodically if not available
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkEverything = async () => {
      try {
        const status = await tauriApi.getEverythingStatus();
        setIsEverythingAvailable(status.available);
        setEverythingError(status.error || null);

        // Get Everything path and version for debugging
        if (status.available) {
          try {
            const path = await tauriApi.getEverythingPath();
            setEverythingPath(path);
            if (path) {
              // Path found
            }

            // Get Everything version
            try {
              const version = await tauriApi.getEverythingVersion();
              setEverythingVersion(version);
              if (version) {
                // Version retrieved
              }
            } catch (error) {
              console.error("Failed to get Everything version:", error);
            }
          } catch (error) {
            console.error("Failed to get Everything path:", error);
          }

          // 如果检测到已安装，清除定时器
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            console.log("[Everything检测] 检测到 Everything 已安装，停止定时检测");
          }

          return true;
        } else {
          console.warn("Everything is not available:", status.error);
          setEverythingPath(null);
          setEverythingVersion(null);
          return false;
        }
      } catch (error) {
        console.error("Failed to check Everything availability:", error);
        setIsEverythingAvailable(false);
        setEverythingPath(null);
        setEverythingVersion(null);
        setEverythingError("检查失败");
        return false;
      }
    };

    // 立即检查一次
    checkEverything().then((isAvailable) => {
      // 如果 Everything 不可用，设置定时检测（每 5 秒检查一次）
      if (!isAvailable) {
        console.log("[Everything检测] Everything 未安装，开始定时检测（每 5 秒）");
        intervalId = setInterval(async () => {
          await checkEverything();
        }, 5000); // 每 5 秒检查一次
      }
    });

    // 组件卸载时清除定时器
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log("[Everything检测] 组件卸载，清除定时检测");
      }
    };
  }, [
    setIsEverythingAvailable,
    setEverythingError,
    setEverythingPath,
    setEverythingVersion,
  ]);

  // Load all memos on mount (for quick search)
  useEffect(() => {
    const loadMemos = async () => {
      try {
        const list = await tauriApi.getAllMemos();
        setMemos(list);
      } catch (error) {
        console.error("Failed to load memos:", error);
      }
    };
    loadMemos();
  }, [setMemos]);

  // Load open history on mount
  useEffect(() => {
    const loadOpenHistory = async () => {
      try {
        const history = await tauriApi.getOpenHistory();
        setOpenHistory(history);
        // 加载所有 URL 的备注信息（备注存储在 name 字段中）
        const remarks: Record<string, string> = {};
        for (const [key] of Object.entries(history)) {
          if (key.startsWith("http://") || key.startsWith("https://")) {
            try {
              const item = await tauriApi.getOpenHistoryItem(key);
              if (item?.name) {
                remarks[key] = item.name;
              }
            } catch (error) {
              // 忽略单个项加载失败
            }
          }
        }
        setUrlRemarks(remarks);
      } catch (error) {
        console.error("Failed to load open history:", error);
      }
    };
    loadOpenHistory();
  }, [setOpenHistory, setUrlRemarks]);

  // 静默预加载应用列表（组件挂载时，不显示加载状态）
  useEffect(() => {
    let isMounted = true;
    const preloadApplications = async () => {
      try {
        // 静默加载，不设置 isLoading 状态
        const allApps = await tauriApi.scanApplications();
        if (isMounted) {
          const filteredApps = filterWindowsApps(allApps);
          setApps(filteredApps);
          // 同时更新缓存，用于前端搜索
          allAppsCacheRef.current = filteredApps;
          allAppsCacheLoadedRef.current = true;
          // 不设置 filteredApps，等待用户输入查询时再设置
        }
      } catch (error) {
        console.error("Failed to preload applications:", error);
        // 预加载失败不影响用户体验，静默处理
      }
    };
    // 延迟一小段时间，避免阻塞初始渲染
    const timer = setTimeout(preloadApplications, 100);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [setApps, filterWindowsApps, allAppsCacheRef, allAppsCacheLoadedRef]);

  // 静默预加载文件历史（组件挂载时，不显示加载状态）
  useEffect(() => {
    let isMounted = true;
    const preloadFileHistory = async () => {
      try {
        // 静默加载所有文件历史到前端缓存
        const allFileHistory = await tauriApi.getAllFileHistory();
        if (isMounted) {
          allFileHistoryCacheRef.current = allFileHistory;
          allFileHistoryCacheLoadedRef.current = true;
        }
      } catch (error) {
        console.error("Failed to preload file history:", error);
        // 预加载失败不影响用户体验，静默处理
      }
    };
    // 延迟一小段时间，避免阻塞初始渲染
    const timer = setTimeout(preloadFileHistory, 200);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [allFileHistoryCacheRef, allFileHistoryCacheLoadedRef]);

  // 监听插件快捷键（通过后端全局监听）
  const lastTriggeredRef = useRef<{ pluginId: string; time: number } | null>(null);

  useEffect(() => {
    // 监听后端发送的插件快捷键触发事件
    let unsubscribeTriggered: (() => void) | null = null;
    let unsubscribeUpdated: (() => void) | null = null;

    const setupListeners = async () => {
      // 监听插件快捷键触发事件（从后端发送）
      unsubscribeTriggered = await listen<string>("plugin-hotkey-triggered", async (event) => {
        const pluginId = event.payload;

        // 前端防抖：检查是否在 500ms 内重复触发同一个插件
        // 增加防抖时间，防止重复打开窗口
        const now = Date.now();
        if (lastTriggeredRef.current) {
          const { pluginId: lastId, time: lastTime } = lastTriggeredRef.current;
          if (lastId === pluginId && now - lastTime < 500) {
            console.log(
              `[PluginHotkeys] ⏭️  Ignored duplicate trigger for plugin: ${pluginId} (within 500ms)`
            );
            return;
          }
        }

        // 记录触发时间和插件 ID
        lastTriggeredRef.current = { pluginId, time: now };

        console.log(`[PluginHotkeys] ✅ Hotkey triggered for plugin: ${pluginId}`);

        try {
          const { executePlugin } = await import("../plugins");
          const pluginContext: PluginContext = {
            query,
            setQuery,
            setSelectedIndex,
            hideLauncher: async () => {
              await tauriApi.hideLauncher();
            },
            tauriApi,
          };
          await executePlugin(pluginId, pluginContext);
        } catch (error) {
          console.error(`[PluginHotkeys] ❌ Failed to execute plugin ${pluginId}:`, error);
        }
      });

      // 监听插件快捷键更新事件
      unsubscribeUpdated = await listen<Record<string, { modifiers: string[]; key: string }>>(
        "plugin-hotkeys-updated",
        () => {
          // 插件快捷键更新事件处理（当前为空）
        }
      );
    };

    setupListeners().catch((error) => {
      console.error("[PluginHotkeys] Failed to setup listeners:", error);
    });

    return () => {
      if (unsubscribeTriggered) {
        unsubscribeTriggered();
      }
      if (unsubscribeUpdated) {
        unsubscribeUpdated();
      }
    };
  }, [query, setQuery, setSelectedIndex]);

  // Listen for Everything download progress events
  useEffect(() => {
    if (!isDownloadingEverything) return;

    let unlistenFn: (() => void) | null = null;

    const setupProgressListener = async () => {
      const unlisten = await listen<number>("everything-download-progress", (event) => {
        setEverythingDownloadProgress(event.payload);
      });
      unlistenFn = unlisten;
    };

    setupProgressListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [isDownloadingEverything, setEverythingDownloadProgress]);
}

