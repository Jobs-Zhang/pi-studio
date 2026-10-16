import type { PluginI18nService, PluginLocale, PluginMessageCatalog } from "@pi-studio/pi-studio/plugin-api";

/** User-visible strings owned by the Workspace Tasks plugin. */
const en = {
  "panel.title": "Workspace Tasks",
  "panel.selectWorkspace": "Select a workspace.",
  "panel.refresh": "Refresh",
  "panel.openTerminal": "Open Terminal",
  "panel.loadingConfig": "Loading {path}…",
  "panel.noTasks": "No tasks are defined in {path}. Add tasks to the file, then click Refresh.",
  "panel.tasksHint": "Tasks run in a dedicated workspace terminal, then switch to that terminal. Edit {path} and click Refresh to reload.",
  "status.refreshing": "Refreshing {path}…",
  "status.loaded": "Loaded {count} tasks.",
  "status.loaded_one": "Loaded {count} task.",
  "status.loaded_other": "Loaded {count} tasks.",
  "status.staleTask": "That task is no longer available. Click Refresh, then try again.",
  "status.busy": "Another task is already starting. Wait for it to finish dispatching, then try again.",
  "status.cancelled": "Cancelled {title}.",
  "status.starting": "Starting {title}…",
  "status.started": "Started terminal command “{title}”.",
  "status.selectWorkspace": "Select a workspace before opening a terminal.",
  "task.run": "Run",
  "task.dispatching": "Dispatching…",
  "confirm.run": "Run {title}?\n\n{command}",
  "config.missingMessage": "No workspace tasks configured here.",
  "config.missingHint": "{path} is optional. Create it in this workspace if you want custom tasks.",
  "config.unavailableMessage": "Could not load workspace tasks.",
  "config.refreshHint": "Fix {path}, then click Refresh.",
  "config.readFailed": "Unable to read {path}: {error}",
  "config.notText": "{path} must be a text file",
  "config.truncated": "{path} is too large and was truncated",
  "action.open.title": "Open Workspace Tasks",
  "action.open.description": "Open the workspace Tasks tab. Configure tasks in {path}.",
} as const;

export type TasksMessageKey = keyof typeof en;

const zhCN: Record<TasksMessageKey, string> = {
  "panel.title": "工作区任务",
  "panel.selectWorkspace": "请选择一个工作区。",
  "panel.refresh": "刷新",
  "panel.openTerminal": "打开终端",
  "panel.loadingConfig": "正在加载 {path}…",
  "panel.noTasks": "{path} 中未定义任何任务。请在该文件中添加任务，然后点击刷新。",
  "panel.tasksHint": "任务会在专用的工作区终端中运行，然后切换到该终端。编辑 {path} 并点击刷新以重新加载。",
  "status.refreshing": "正在刷新 {path}…",
  "status.loaded": "已加载 {count} 个任务。",
  "status.loaded_one": "已加载 {count} 个任务。",
  "status.loaded_other": "已加载 {count} 个任务。",
  "status.staleTask": "该任务已不可用。请点击刷新，然后重试。",
  "status.busy": "另一个任务正在启动。请等待其完成调度后再重试。",
  "status.cancelled": "已取消 {title}。",
  "status.starting": "正在启动 {title}…",
  "status.started": "已启动终端命令“{title}”。",
  "status.selectWorkspace": "请先选择一个工作区再打开终端。",
  "task.run": "运行",
  "task.dispatching": "正在调度…",
  "confirm.run": "运行 {title}？\n\n{command}",
  "config.missingMessage": "此处未配置工作区任务。",
  "config.missingHint": "{path} 是可选的。如需自定义任务，请在此工作区中创建它。",
  "config.unavailableMessage": "无法加载工作区任务。",
  "config.refreshHint": "修复 {path}，然后点击刷新。",
  "config.readFailed": "无法读取 {path}：{error}",
  "config.notText": "{path} 必须是文本文件",
  "config.truncated": "{path} 过大，已被截断",
  "action.open.title": "打开工作区任务",
  "action.open.description": "打开工作区“任务”标签页。在 {path} 中配置任务。",
};

const catalogs: Record<PluginLocale, PluginMessageCatalog> = { en, "zh-CN": zhCN };

const enByKey: Readonly<Record<string, string>> = en;

// Fall back to the English source before activation so a panel rendered outside
// the host (Node-side artifact checks, early first paint) shows real text.
let translate: PluginI18nService["t"] = (key, params) => {
  const template = enByKey[key] ?? key;
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
};

/** Register this plugin's catalog for the activation locale and adopt its translator. */
export function initMessages(i18n: PluginI18nService | undefined): void {
  if (i18n === undefined) return;
  i18n.registerCatalog(catalogs[i18n.locale]);
  translate = i18n.t;
}

/** Translate a plugin-local key with the activation locale. */
export function t(key: TasksMessageKey, params?: Readonly<Record<string, string | number>>): string {
  return translate(key, params);
}
