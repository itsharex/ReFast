import { useMemo } from "react";
import { plugins } from "../../plugins";
import { getPluginIcon, getPluginIconBg, getPluginIconColor } from "../../utils/pluginIconUtils.tsx";

interface PluginsTabProps {
  searchQuery: string;
  onPluginClick: (pluginId: string) => Promise<void>;
}

export function PluginsTab({ searchQuery, onPluginClick }: PluginsTabProps) {
  // 所有可用插件（排除 show_plugin_list）
  const availablePlugins = useMemo(() => {
    return plugins.filter(plugin => plugin.id !== 'show_plugin_list');
  }, []);

  // 过滤插件
  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) {
      return availablePlugins;
    }
    const query = searchQuery.toLowerCase();
    return availablePlugins.filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(query) ||
        plugin.description?.toLowerCase().includes(query) ||
        plugin.keywords.some((keyword) => keyword.toLowerCase().includes(query))
    );
  }, [searchQuery, availablePlugins]);

  return (
    <div className="space-y-4">
      {filteredPlugins.length === 0 ? (
        <div className="text-center py-16">
          <svg
            className="w-16 h-16 mx-auto text-gray-300 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-gray-500 text-lg font-medium">
            {searchQuery ? "未找到匹配的插件" : "暂无插件"}
          </div>
          {searchQuery && (
            <div className="text-gray-400 text-sm mt-2">
              尝试使用其他关键词搜索
            </div>
          )}
        </div>
      ) : (
        filteredPlugins.map((plugin, index) => {
          const displayedKeywords = plugin.keywords?.slice(0, 6) || [];
          const hasMoreKeywords = (plugin.keywords?.length || 0) > 6;
          
          return (
            <div
              key={plugin.id}
              onClick={() => onPluginClick(plugin.id)}
              className="group relative p-5 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-[0.98]"
              style={{
                animation: `fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both`,
              }}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${getPluginIconBg(plugin.id)} group-hover:scale-110 transition-transform duration-200 shadow-sm`}>
                  <div className={getPluginIconColor(plugin.id)}>
                    {getPluginIcon(plugin.id)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-base mb-1.5 group-hover:text-gray-700 transition-colors">
                    {plugin.name}
                  </div>
                  {plugin.description && (
                    <div className="text-sm text-gray-600 leading-relaxed mb-3">
                      {plugin.description}
                    </div>
                  )}
                  {displayedKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {displayedKeywords.map((keyword, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 text-xs bg-gray-50 text-gray-600 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors"
                        >
                          {keyword}
                        </span>
                      ))}
                      {hasMoreKeywords && (
                        <span className="px-2.5 py-1 text-xs bg-gray-50 text-gray-500 rounded-md border border-gray-200">
                          +{(plugin.keywords?.length || 0) - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* 悬停时的装饰性边框 */}
              <div className="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-green-200 pointer-events-none transition-colors duration-200" />
            </div>
          );
        })
      )}
      {/* 插件统计信息 - 显示在列表底部 */}
      <div className="mt-6 pt-6 border-t border-gray-200 flex items-center justify-center gap-4 text-sm">
        <div className="text-gray-600">
          共 <span className="font-medium text-green-600">{availablePlugins.length}</span> 个插件
          {searchQuery && (
            <span className="ml-1 text-gray-500">
              （找到 <span className="font-medium text-green-600">{filteredPlugins.length}</span> 个）
            </span>
          )}
        </div>
        <div className="text-gray-400">•</div>
        <div className="text-gray-500">插件持续开发优化中...</div>
      </div>
    </div>
  );
}

