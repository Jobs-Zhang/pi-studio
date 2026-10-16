import type { PluginI18nService, PluginLocale, PluginMessageCatalog } from "@pi-studio/pi-studio/plugin-api";

/** User-visible strings owned by the Git plugin's browser panel. */
const en = {
  "panel.title": "Git",
  "panel.stale": "stale",
  "panel.refresh": "Refresh",
  "view.groupLabel": "Changed files view",
  "view.list": "List",
  "view.tree": "Tree",
  "view.collapseAll": "Collapse all",
  "view.expandAll": "Expand all",
  "list.loading": "Loading status…",
  "list.statusUnavailable": "Status unavailable.",
  "list.notRepo": "Not a git repository.",
  "list.noChanges": "No changes.",
  "list.detached": "detached",
  "list.submodule": "submodule",
  "diff.selectFile": "Select a changed file.",
  "diff.loading": "Loading diff…",
  "diff.none": "No staged or unstaged diff.",
  "diff.header": "diff",
  "diff.staged": "staged",
  "diff.unstaged": "unstaged",
  "diff.truncated": "truncated",
  "diff.empty": "No diff.",
  "diff.tableLabel": "Unified diff",
  "error.backendUnavailable": "Git workspace backend is unavailable. Update and restart PI STUDIO on this machine, then reload the browser.",
  "action.goToGit": "Go to Git",
  "action.refreshGit": "Refresh Git",
} as const;

export type GitMessageKey = keyof typeof en;

const zhCN: Record<GitMessageKey, string> = {
  "panel.title": "Git",
  "panel.stale": "已过期",
  "panel.refresh": "刷新",
  "view.groupLabel": "更改文件视图",
  "view.list": "列表",
  "view.tree": "树状",
  "view.collapseAll": "全部折叠",
  "view.expandAll": "全部展开",
  "list.loading": "正在加载状态…",
  "list.statusUnavailable": "状态不可用。",
  "list.notRepo": "不是 Git 仓库。",
  "list.noChanges": "没有更改。",
  "list.detached": "游离",
  "list.submodule": "子模块",
  "diff.selectFile": "选择一个已更改的文件。",
  "diff.loading": "正在加载差异…",
  "diff.none": "没有暂存或未暂存的差异。",
  "diff.header": "差异",
  "diff.staged": "已暂存",
  "diff.unstaged": "未暂存",
  "diff.truncated": "已截断",
  "diff.empty": "没有差异。",
  "diff.tableLabel": "统一差异",
  "error.backendUnavailable": "Git 工作区后端不可用。请在此机器上更新并重启 PI STUDIO，然后重新加载浏览器。",
  "action.goToGit": "转到 Git",
  "action.refreshGit": "刷新 Git",
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
export function t(key: GitMessageKey, params?: Readonly<Record<string, string | number>>): string {
  return translate(key, params);
}
