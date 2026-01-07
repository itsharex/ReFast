import type { PluginContext } from "../../../types";

export default async function execute(context: PluginContext) {
  // 打开独立的 Markdown 编辑器窗口
  if (context.tauriApi) {
    await context.tauriApi.showMarkdownEditorWindow();
    // 关闭启动器
    await context.hideLauncher();
  }
}

