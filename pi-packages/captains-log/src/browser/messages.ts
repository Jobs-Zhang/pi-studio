import type { PluginI18nService, PluginLocale, PluginMessageCatalog } from "@pi-studio/pi-studio/plugin-api";

/** User-visible strings owned by the Captain's Log package. */
const en = {
  "action.openTranslator": "Open pirate translator",
  "panel.title": "Captain's Log",
  "panel.aria": "Captain's Log",
  "panel.heading": "⚓ Captain's Log",
  "panel.subtitle": "Your last reply, retold by a theatrical pirate.",
  "panel.selectedSession": "Selected session",
  "panel.noSession": "No session selected",
  "panel.translate": "Let the Captain tell it",
  "panel.reconnect": "Reconnect",
  "panel.reconnectNotice": "Reconnect to see the result. The captain may still be working; your request will not be sent again.",
  "reply.aria": "Pirate translation",
  "reply.translating": "Translating…",
  "reply.last": "Last translation",
  "reply.earlier": "Earlier translation",
  "reply.receiving": "Receiving the captain's reply…",
  "reply.reading": "Reading the source reply and turning it into pirate. No message is sent to the source conversation.",
  "reply.interrupted": "Translation interrupted",
  "reply.failed": "Couldn't translate that reply",
  "reply.failedHint": "Check Diagnostics for details, then try again when the session is ready.",
  "reply.openSource": "Open source session",
  "panel.empty": "Pick a conversation, then translate its latest finished assistant reply. The original stays untouched.",
  "history.summary": "Previous translations",
  "history.translated": "Translated",
  "history.working": "Working",
  "history.notCompleted": "Not completed",
  "diagnostics.summary": "Diagnostics",
  "diagnostics.machine": "Machine",
  "diagnostics.sourceSession": "Source session",
  "diagnostics.pirateSession": "Pirate session",
  "diagnostics.request": "Request",
  "diagnostics.unknown": "Unknown",
  "diagnostics.notCreated": "Not created",
  "panel.footnote": "Uses your configured model. Reuses the pirate while it's available; otherwise starts one automatically.",
  "markdown.taskCompleted": "Task completed",
  "session.fallbackName": "Session {id}",
  "status.connecting": "Connecting to Captain's Log…",
  "status.connectingShort": "Connecting…",
  "status.connectionLost": "Connection lost",
  "status.fetching": "Fetching the last reply…",
  "status.translating": "The captain is translating…",
  "status.selectSession": "Select a session in this workspace first.",
  "status.pirateSelected": "Select a different session — this one is the pirate.",
  "status.ready": "Ready to translate",
  "status.connected": "Connected. Live updates arrive from the backend.",
  "status.channelClosed": "Channel closed. Admission is uncertain; reconnect before retrying. Questions are never resent automatically.",
  "status.channelClosedShort": "Channel closed",
  "status.invalidFrame": "Invalid Captain channel frame",
  "status.admitted": "Backend admitted {id}; admission is not completion.",
  "status.saved": "Backend saved {status} roundtrip.",
  "status.stage": "Captain: {stage}",
  "status.closedWithReason": "{reason}. Admission may be uncertain. Reconnect to restore saved state; translations are never resent automatically.",
  "status.reconnectExplicit": "{error}. Reconnect explicitly; no translation was resent.",
  "status.queued": "Translation queued for source session {id}; waiting for backend admission.",
  "status.uncertain": "{error}. Admission is uncertain; reconnect before retrying.",
  "error.recordsUnavailable": "Captain saved records unavailable",
  "error.invalidRecord": "Invalid Captain record",
  "error.channelsUnavailable": "Captain backend channels unavailable on this machine",
  "error.invalidSnapshot": "Invalid Captain snapshot",
} as const;

export type CaptainsLogMessageKey = keyof typeof en;

const zhCN: Record<CaptainsLogMessageKey, string> = {
  "action.openTranslator": "打开海盗翻译",
  "panel.title": "船长日志",
  "panel.aria": "船长日志",
  "panel.heading": "⚓ 船长日志",
  "panel.subtitle": "由一位戏精海盗复述你的上一条回复。",
  "panel.selectedSession": "已选会话",
  "panel.noSession": "未选择会话",
  "panel.translate": "让船长来讲",
  "panel.reconnect": "重新连接",
  "panel.reconnectNotice": "重新连接以查看结果。船长可能仍在工作；你的请求不会再次发送。",
  "reply.aria": "海盗翻译",
  "reply.translating": "翻译中…",
  "reply.last": "最近一次翻译",
  "reply.earlier": "更早的翻译",
  "reply.receiving": "正在接收船长的回复…",
  "reply.reading": "正在读取源回复并翻译成海盗腔。不会向源会话发送任何消息。",
  "reply.interrupted": "翻译已中断",
  "reply.failed": "无法翻译该回复",
  "reply.failedHint": "请查看诊断信息了解详情，然后在会话就绪后重试。",
  "reply.openSource": "打开源会话",
  "panel.empty": "选择一个会话，然后翻译其最近一条已完成的助手回复。原文保持不变。",
  "history.summary": "历史翻译",
  "history.translated": "已翻译",
  "history.working": "处理中",
  "history.notCompleted": "未完成",
  "diagnostics.summary": "诊断",
  "diagnostics.machine": "机器",
  "diagnostics.sourceSession": "源会话",
  "diagnostics.pirateSession": "海盗会话",
  "diagnostics.request": "请求",
  "diagnostics.unknown": "未知",
  "diagnostics.notCreated": "未创建",
  "panel.footnote": "使用你配置的模型。海盗可用时会复用；否则会自动启动一个。",
  "markdown.taskCompleted": "任务已完成",
  "session.fallbackName": "会话 {id}",
  "status.connecting": "正在连接船长日志…",
  "status.connectingShort": "正在连接…",
  "status.connectionLost": "连接已断开",
  "status.fetching": "正在获取上一条回复…",
  "status.translating": "船长正在翻译…",
  "status.selectSession": "请先在此工作区中选择一个会话。",
  "status.pirateSelected": "请选择另一个会话 — 这个会话就是海盗。",
  "status.ready": "可以翻译",
  "status.connected": "已连接。实时更新来自后端。",
  "status.channelClosed": "通道已关闭。准入状态不确定；请重新连接后再试。问题不会自动重发。",
  "status.channelClosedShort": "通道已关闭",
  "status.invalidFrame": "无效的船长通道帧",
  "status.admitted": "后端已受理 {id}；受理不代表完成。",
  "status.saved": "后端已保存 {status} 往返记录。",
  "status.stage": "船长：{stage}",
  "status.closedWithReason": "{reason}。准入状态可能不确定。重新连接以恢复已保存状态；翻译不会自动重发。",
  "status.reconnectExplicit": "{error}。请显式重新连接；未重发任何翻译。",
  "status.queued": "已为源会话 {id} 排队翻译；等待后端受理。",
  "status.uncertain": "{error}。准入状态不确定；请重新连接后再试。",
  "error.recordsUnavailable": "船长已保存记录不可用",
  "error.invalidRecord": "无效的船长记录",
  "error.channelsUnavailable": "此机器上的船长后端通道不可用",
  "error.invalidSnapshot": "无效的船长快照",
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
export function t(key: CaptainsLogMessageKey, params?: Readonly<Record<string, string | number>>): string {
  return translate(key, params);
}
