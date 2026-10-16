import type { PluginI18nService, PluginLocale, PluginMessageCatalog } from "@pi-studio/pi-studio/plugin-api";

/** User-visible strings owned by the Info plugin. */
const en = {
  "action.copy.title": "Copy PI STUDIO Diagnostics",
  "action.copy.description": "Copy version, installation, and status details for this machine, ready to paste into a bug report",
  "panel.title": "Info",
  "health.current": "current",
  "health.restartNeeded": "restart needed",
  "health.unavailable": "unavailable",
  "version.unknown": "unknown",
  "installation.unknown": "installation unknown",
  "installation.piPackage": "Pi package",
  "installation.npmGlobal": "global npm package",
  "installation.local": "local checkout",
  "installation.dockerDev": "Docker development runtime",
  "installation.docker": "Docker runtime",
  "machine.local": "local machine",
  "machine.remote": "remote machine",
  "release.updateAvailable": "Update available",
  "release.updateAvailableVersion": "Update available: {version}",
  "release.checkFailed": "Update check failed: {error}",
  "release.checkSkipped": "Update check skipped",
  "release.upToDate": "Up to date",
  "component.running": "running {version}",
  "component.installed": "installed {version}",
  "component.pi": "pi {version}",
  "component.error": "error: {error}",
  "drift.sessionDaemon": "session daemon running {version}",
  "flags.folder": "folder workspace",
  "flags.provider": "provider: {id}",
  "flags.main": "main workspace",
  "diagnostics.title": "PI STUDIO diagnostics",
  "diagnostics.statusUnavailable": "Status: unavailable",
  "diagnostics.package": "Package: {name}",
  "diagnostics.release": "Release: {summary}{checked}",
  "diagnostics.checked": " (checked {time})",
  "diagnostics.statusGenerated": "Status generated: {time}",
  "diagnostics.machine": "Machine: {name} ({kind})",
  "diagnostics.noWorkspace": "Workspace: none selected",
  "diagnostics.workspace": "Workspace: {label} — {path} ({flags})",
  "status.unavailable": "PI STUDIO status is not available yet. It refreshes automatically in the background.",
  "status.version": "Version",
  "status.pi": "Pi",
  "status.package": "Package",
  "status.installation": "Installation",
  "status.release": "Release",
  "status.checked": "checked {time}",
  "status.messageCountOne": "{count} status message — open the Updates tab for details.",
  "status.messageCountMany": "{count} status messages — open the Updates tab for details.",
  "status.generated": "Status generated {time}",
  "section.services": "Services",
  "section.machine": "Machine",
  "section.workspace": "Workspace",
  "field.name": "Name",
  "field.type": "Type",
  "field.path": "Path",
} as const;

export type InfoMessageKey = keyof typeof en;

const zhCN: Record<InfoMessageKey, string> = {
  "action.copy.title": "复制 PI STUDIO 诊断信息",
  "action.copy.description": "复制此机器的版本、安装与状态详情，便于粘贴到 bug 报告中",
  "panel.title": "信息",
  "health.current": "当前",
  "health.restartNeeded": "需要重启",
  "health.unavailable": "不可用",
  "version.unknown": "未知",
  "installation.unknown": "安装信息未知",
  "installation.piPackage": "Pi 包",
  "installation.npmGlobal": "全局 npm 包",
  "installation.local": "本地检出",
  "installation.dockerDev": "Docker 开发运行时",
  "installation.docker": "Docker 运行时",
  "machine.local": "本地机器",
  "machine.remote": "远程机器",
  "release.updateAvailable": "有可用更新",
  "release.updateAvailableVersion": "有可用更新：{version}",
  "release.checkFailed": "更新检查失败：{error}",
  "release.checkSkipped": "已跳过更新检查",
  "release.upToDate": "已是最新",
  "component.running": "运行中 {version}",
  "component.installed": "已安装 {version}",
  "component.pi": "pi {version}",
  "component.error": "错误：{error}",
  "drift.sessionDaemon": "会话守护进程运行 {version}",
  "flags.folder": "文件夹工作区",
  "flags.provider": "提供方：{id}",
  "flags.main": "主工作区",
  "diagnostics.title": "PI STUDIO 诊断信息",
  "diagnostics.statusUnavailable": "状态：不可用",
  "diagnostics.package": "包：{name}",
  "diagnostics.release": "发布：{summary}{checked}",
  "diagnostics.checked": "（检查时间 {time}）",
  "diagnostics.statusGenerated": "状态生成时间：{time}",
  "diagnostics.machine": "机器：{name}（{kind}）",
  "diagnostics.noWorkspace": "工作区：未选择",
  "diagnostics.workspace": "工作区：{label} — {path}（{flags}）",
  "status.unavailable": "PI STUDIO 状态尚不可用。它会在后台自动刷新。",
  "status.version": "版本",
  "status.pi": "Pi",
  "status.package": "包",
  "status.installation": "安装",
  "status.release": "发布",
  "status.checked": "检查时间 {time}",
  "status.messageCountOne": "{count} 条状态消息 — 打开“更新”标签页查看详情。",
  "status.messageCountMany": "{count} 条状态消息 — 打开“更新”标签页查看详情。",
  "status.generated": "状态生成于 {time}",
  "section.services": "服务",
  "section.machine": "机器",
  "section.workspace": "工作区",
  "field.name": "名称",
  "field.type": "类型",
  "field.path": "路径",
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
export function t(key: InfoMessageKey, params?: Readonly<Record<string, string | number>>): string {
  return translate(key, params);
}
