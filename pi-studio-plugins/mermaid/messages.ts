import type { PluginI18nService, PluginLocale, PluginMessageCatalog } from "@pi-studio/pi-studio/plugin-api";

/** User-visible strings owned by the Mermaid plugin. */
const en = {
  "status.rendering": "Rendering diagram…",
  "diagram.title": "Mermaid diagram",
  "error.engineUnavailable": "Mermaid engine unavailable ({status})",
  "error.render": "Mermaid could not render this source",
  "error.timeout": "Mermaid preview timed out",
} as const;

export type MermaidMessageKey = keyof typeof en;

const zhCN: Record<MermaidMessageKey, string> = {
  "status.rendering": "正在渲染图表…",
  "diagram.title": "Mermaid 图表",
  "error.engineUnavailable": "Mermaid 引擎不可用（{status}）",
  "error.render": "Mermaid 无法渲染此源内容",
  "error.timeout": "Mermaid 预览超时",
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
export function t(key: MermaidMessageKey, params?: Readonly<Record<string, string | number>>): string {
  return translate(key, params);
}
