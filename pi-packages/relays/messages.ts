import type { PluginI18nService, PluginLocale, PluginMessageCatalog } from "@pi-studio/pi-studio/plugin-api";

/** User-visible strings owned by the Relays package. */
const en = {
  "action.open.title": "Open Workspace Relays",
  "action.open.description": "Open the workspace Relays tab. Relays live in {root}.",
  "panel.title": "Relays",
  "panel.documentsLabel": "Relay documents",
  "panel.selectWorkspace": "Select a workspace.",
  "panel.refresh": "Refresh",
  "panel.relayPicker": "Relay",
  "panel.containsActive": "Contains the open document",
  "panel.scanning": "Scanning {root}…",
  "error.scanFailed": "Could not scan workspace relays.",
  "panel.loadingDocuments": "Loading relay documents…",
  "error.listFailed": "Could not list this relay's documents.",
  "panel.relayMissingTitle": "This relay no longer exists.",
  "panel.relayMissingHint": "Click Refresh to rescan {root}.",
  "panel.partialNotice": "Some nested content is not listed — this relay tree is deeper or larger than the panel lists.",
  "panel.noDocumentsTitle": "This relay has no documents yet.",
  "panel.noDocumentsHint": "Relay Runner packets usually contain <code>status.md</code>, <code>charter.md</code>, <code>operations.md</code>, and <code>log.md</code>.",
  "panel.selectDocument": "Select a document.",
  "panel.loadingDocument": "Loading {name}…",
  "error.readFailed": "Could not read this document.",
  "panel.documentMissingTitle": "This document no longer exists.",
  "panel.documentMissingHint": "Click Refresh to rescan the relay.",
  "panel.binaryTitle": "Binary file: {name}",
  "panel.binaryHint": "Binary documents have no text preview.",
  "panel.truncatedNotice": "This document is truncated — only the beginning is shown.",
  "panel.emptyTitle": "No relays in this workspace.",
  "panel.emptyHint": "Relay packets live in <code>{root}/&lt;name&gt;/</code>. This workspace has none yet.",
} as const;

export type RelaysMessageKey = keyof typeof en;

const zhCN: Record<RelaysMessageKey, string> = {
  "action.open.title": "打开工作区 Relay",
  "action.open.description": "打开工作区“Relay”标签页。Relay 位于 {root}。",
  "panel.title": "Relay",
  "panel.documentsLabel": "Relay 文档",
  "panel.selectWorkspace": "请选择一个工作区。",
  "panel.refresh": "刷新",
  "panel.relayPicker": "Relay",
  "panel.containsActive": "包含当前打开的文档",
  "panel.scanning": "正在扫描 {root}…",
  "error.scanFailed": "无法扫描工作区 Relay。",
  "panel.loadingDocuments": "正在加载 Relay 文档…",
  "error.listFailed": "无法列出此 Relay 的文档。",
  "panel.relayMissingTitle": "此 Relay 已不存在。",
  "panel.relayMissingHint": "点击刷新以重新扫描 {root}。",
  "panel.partialNotice": "部分嵌套内容未列出 — 此 Relay 树比面板所列的更深或更大。",
  "panel.noDocumentsTitle": "此 Relay 还没有文档。",
  "panel.noDocumentsHint": "Relay Runner 数据包通常包含 <code>status.md</code>、<code>charter.md</code>、<code>operations.md</code> 和 <code>log.md</code>。",
  "panel.selectDocument": "请选择一个文档。",
  "panel.loadingDocument": "正在加载 {name}…",
  "error.readFailed": "无法读取此文档。",
  "panel.documentMissingTitle": "此文档已不存在。",
  "panel.documentMissingHint": "点击刷新以重新扫描该 Relay。",
  "panel.binaryTitle": "二进制文件：{name}",
  "panel.binaryHint": "二进制文档没有文本预览。",
  "panel.truncatedNotice": "此文档已截断 — 仅显示开头部分。",
  "panel.emptyTitle": "此工作区中没有 Relay。",
  "panel.emptyHint": "Relay 数据包位于 <code>{root}/&lt;name&gt;/</code>。此工作区还没有。",
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

/** Register this package's catalog for the activation locale and adopt its translator. */
export function initMessages(i18n: PluginI18nService | undefined): void {
  if (i18n === undefined) return;
  i18n.registerCatalog(catalogs[i18n.locale]);
  translate = i18n.t;
}

/** Translate a package-local key with the activation locale. */
export function t(key: RelaysMessageKey, params?: Readonly<Record<string, string | number>>): string {
  return translate(key, params);
}
