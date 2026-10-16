import type { PluginI18nService, PluginLocale, PluginMessageCatalog } from "@pi-studio/pi-studio/plugin-api";

/**
 * User-visible strings owned by the Updates plugin. `en` is the source catalog;
 * `zh-CN` is typed against it so a missing translation is a compile error.
 */
const en = {
  "panel.title": "Updates",
  "panel.checking": "Checking PI STUDIO update status…",
  "panel.installedServices": "Installed services",
  "panel.generatedAt": "Generated {time}",
  "panel.latestRelease": "Latest npm release {version}",
  "panel.releaseChecked": "Release checked {time}",
  "panel.releaseSkipped": "Remote version check skipped.",
  "panel.releaseFailed": "Remote version check failed: {error}",
  "panel.noMessages": "No PI STUDIO update or restart messages.",
  "panel.recommended": "Recommended",
  "panel.recommendedHint": "Run the recommended command. Updates require confirmation in the terminal and may interrupt active sessions; the CLI will provide instructions if this terminal cannot safely run the update.",
  "panel.additionalCommands": "Additional commands (optional)",
  "panel.suggestedCommands": "Suggested commands",
  "panel.additionalHint": "Only needed for finer control, such as restarting a single service.",
  "component.current": "current",
  "component.restartNeeded": "restart needed",
  "component.unavailable": "unavailable",
  "component.versions": "running {running} · installed {installed}",
  "command.copy": "Copy",
  "command.run": "Run",
  "severity.info": "info",
  "severity.warning": "warning",
  "severity.error": "error",
  "command.update": "Update PI STUDIO",
  "command.restartEverything": "Restart everything",
  "command.updateShort": "Update",
  "command.restartAll": "Restart all",
  "command.restartWeb": "Restart Web/UI",
  "command.restartSessiond": "Restart session daemon",
  "command.status": "Status",
  "version.unknown": "unknown",
  "installation.unknown": "installation unknown",
  "installation.piPackage": "Pi package",
  "installation.npmGlobal": "global npm package",
  "installation.local": "local checkout",
  "installation.dockerDev": "Docker development runtime",
  "installation.docker": "Docker runtime",
  "fallback.generatedAt": "federated status unavailable",
  "fallback.webLabel": "Web/UI",
  "fallback.sessiondLabel": "Session daemon",
  "fallback.dockerMessageTitle": "Docker update commands available",
  "fallback.dockerMessageBody": "This Updates plugin was loaded from a Docker PI STUDIO runtime, but the gateway has not provided Docker-aware status details yet. The Docker maintenance commands below are still available.",
  "action.check.title": "Check for PI STUDIO Updates",
  "action.check.description": "Bypass cached release data and check the selected machine now",
  "action.check.disabled": "Update checks require a newer PI STUDIO gateway",
} as const;

export type UpdatesMessageKey = keyof typeof en;

const zhCN: Record<UpdatesMessageKey, string> = {
  "panel.title": "更新",
  "panel.checking": "正在检查 PI STUDIO 更新状态…",
  "panel.installedServices": "已安装的服务",
  "panel.generatedAt": "生成时间 {time}",
  "panel.latestRelease": "最新 npm 版本 {version}",
  "panel.releaseChecked": "版本检查时间 {time}",
  "panel.releaseSkipped": "已跳过远程版本检查。",
  "panel.releaseFailed": "远程版本检查失败：{error}",
  "panel.noMessages": "没有 PI STUDIO 更新或重启消息。",
  "panel.recommended": "推荐",
  "panel.recommendedHint": "请运行推荐的命令。更新需要在终端中确认，并可能中断活动会话；如果此终端无法安全运行更新，CLI 会提供说明。",
  "panel.additionalCommands": "其他命令（可选）",
  "panel.suggestedCommands": "建议的命令",
  "panel.additionalHint": "仅在需要更精细控制时使用，例如重启单个服务。",
  "component.current": "当前",
  "component.restartNeeded": "需要重启",
  "component.unavailable": "不可用",
  "component.versions": "运行中 {running} · 已安装 {installed}",
  "command.copy": "复制",
  "command.run": "运行",
  "severity.info": "信息",
  "severity.warning": "警告",
  "severity.error": "错误",
  "command.update": "更新 PI STUDIO",
  "command.restartEverything": "重启全部",
  "command.updateShort": "更新",
  "command.restartAll": "重启全部",
  "command.restartWeb": "重启 Web/UI",
  "command.restartSessiond": "重启会话守护进程",
  "command.status": "状态",
  "version.unknown": "未知",
  "installation.unknown": "安装信息未知",
  "installation.piPackage": "Pi 包",
  "installation.npmGlobal": "全局 npm 包",
  "installation.local": "本地检出",
  "installation.dockerDev": "Docker 开发运行时",
  "installation.docker": "Docker 运行时",
  "fallback.generatedAt": "联合状态不可用",
  "fallback.webLabel": "Web/UI",
  "fallback.sessiondLabel": "会话守护进程",
  "fallback.dockerMessageTitle": "Docker 更新命令可用",
  "fallback.dockerMessageBody": "此更新插件从 Docker PI STUDIO 运行时加载，但网关尚未提供 Docker 感知的状态详情。下方仍提供 Docker 维护命令。",
  "action.check.title": "检查 PI STUDIO 更新",
  "action.check.description": "绕过缓存的发布数据，立即检查所选机器",
  "action.check.disabled": "更新检查需要更新的 PI STUDIO 网关",
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
export function t(key: UpdatesMessageKey, params?: Readonly<Record<string, string | number>>): string {
  return translate(key, params);
}
