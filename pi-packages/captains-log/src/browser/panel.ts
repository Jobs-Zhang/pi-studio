import type { PluginActivationContext, WorkspacePanelContext } from "@pi-studio/pi-studio/plugin-api";
import type { LogEntry } from "./protocol.js";
import { renderCaptainMarkdown } from "./markdown.js";
import { t } from "./messages.js";

type Html = PluginActivationContext["html"];
export interface SourceSession { id: string; name: string }
export function selectedSourceSession(context: WorkspacePanelContext): SourceSession | undefined {
  if (context.state?.selectedMachine && context.state.selectedMachine.id !== context.machine.id) return;
  const selected = context.state?.selectedSession;
  if (!selected || selected.archived || selected.pending || selected.cwd !== context.workspace.path) return;
  return { id: selected.id, name: selected.name !== undefined && selected.name.trim() !== "" ? selected.name : t("session.fallbackName", { id: selected.id.slice(0, 8) }) };
}
export interface CaptainPanelView {
  entries: LogEntry[]; selected?: LogEntry; status: string;
  connected: boolean; connecting: boolean; pending: boolean;
  source?: SourceSession;
  notice?: string;
  machineName: string;
  onTranslate: () => void;
  onReconnect: () => void;
  onRead(id: string): void;
  onOpenSource(id: string): void;
}
function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function renderCaptainPanel(html: Html, view: CaptainPanelView) {
  const working = view.entries.some((entry) => entry.status === "running");
  const pirateSelected = view.source !== undefined && view.entries.some((entry) => entry.sessionId === view.source?.id);
  const disabled = !view.connected || view.connecting || view.pending || working || !view.source || pirateSelected;
  const selected = view.selected;
  const sourceSessionId = selected?.sourceSessionId;
  const status = view.connecting ? t("status.connectingShort") : !view.connected ? t("status.connectionLost") : view.pending ? t("status.fetching")
    : working ? t("status.translating") : !view.source ? t("status.selectSession") : pirateSelected ? t("status.pirateSelected")
      : t("status.ready");
  return html`<style>${styles}</style>
    <section class="captains-log" aria-label=${t("panel.aria")}>
      <div class="captain-heading"><h2>${t("panel.heading")}</h2><p class="muted">${t("panel.subtitle")}</p></div>
      <div class="captain-source"><span class="muted">${t("panel.selectedSession")}</span><strong>${view.source?.name ?? t("panel.noSession")}</strong></div>
      <button class="captain-primary" ?disabled=${disabled} @click=${view.onTranslate}>${t("panel.translate")}</button>
      <p class="captain-status" role="status" aria-live="polite">${status}
        ${!view.connected && !view.connecting ? html`<button @click=${view.onReconnect}>${t("panel.reconnect")}</button>` : null}
      </p>
      ${!view.connected && !view.connecting ? html`<p class="captain-notice">${t("panel.reconnectNotice")}</p>` : null}
      ${view.notice !== undefined && view.notice !== "" ? html`<p class="captain-notice" role="alert">${view.notice}</p>` : null}
      ${selected ? html`<article class="captain-reply" aria-label=${t("reply.aria")}>
        <div class="captain-reply-heading"><strong>${selected.status === "running" ? t("reply.translating") : selected.id === view.entries[0]?.id ? t("reply.last") : t("reply.earlier")}</strong><time datetime=${selected.createdAt}>${dateLabel(selected.createdAt)}</time></div>
        ${selected.status === "completed" ? html`<div class="captain-answer">${selected.text ? renderCaptainMarkdown(html, selected.text) : t("reply.receiving")}</div>`
          : selected.status === "running" ? html`<p class="muted">${t("reply.reading")}</p>`
            : html`<div class="captain-notice" role="alert"><strong>${selected.status === "interrupted" ? t("reply.interrupted") : t("reply.failed")}</strong><p>${selected.text || t("reply.failedHint")}</p></div>`}
        ${sourceSessionId !== undefined && sourceSessionId !== "" ? html`<button @click=${() => { view.onOpenSource(sourceSessionId); }}>${t("reply.openSource")}</button>` : null}
      </article>` : html`<p class="captain-empty muted">${t("panel.empty")}</p>`}
      <div class="captain-secondary">
        ${view.entries.length > 1 ? html`<details><summary>${t("history.summary")} <span class="muted">(${view.entries.length})</span></summary>
          <div class="captain-history">${view.entries.map((entry) => html`<button class=${entry.id === selected?.id ? "selected" : ""} ?disabled=${!view.connected} @click=${() => { view.onRead(entry.id); }}>
            <span>${dateLabel(entry.createdAt)} · ${entry.status === "completed" ? t("history.translated") : entry.status === "running" ? t("history.working") : t("history.notCompleted")}</span>
          </button>`)}</div>
        </details>` : null}
        <details class="captain-diagnostics"><summary>${t("diagnostics.summary")}</summary>
          <p>${view.status}</p>
          ${selected ? html`<dl><dt>${t("diagnostics.machine")}</dt><dd>${view.machineName}</dd><dt>${t("diagnostics.sourceSession")}</dt><dd>${selected.sourceSessionId ?? t("diagnostics.unknown")}</dd><dt>${t("diagnostics.pirateSession")}</dt><dd>${selected.sessionId || t("diagnostics.notCreated")}</dd><dt>${t("diagnostics.request")}</dt><dd>${selected.id}</dd></dl>
            <p>${selected.question}</p><ol>${selected.stages.map((stage) => html`<li>${stage}</li>`)}</ol>` : null}
        </details>
        <p class="captain-footnote muted">${t("panel.footnote")}</p>
      </div>
    </section>`;
}
// Light DOM inherits workspace typography/buttons. Extra rules are package-scoped and use host themes.
const styles = `
  captains-log-lifetime { display: block; min-width: 0; }
  .captains-log { box-sizing: border-box; padding: 16px; min-width: 0; color: inherit; font: inherit; line-height: 1.5; }
  .captains-log *, .captains-log *::before, .captains-log *::after { box-sizing: border-box; }
  .captains-log h2, .captains-log p { margin: 0; }
  .captains-log h2 { font-size: 15px; }
  .captains-log button { font: inherit; }
  .captains-log button:hover:not(:disabled) { background: var(--pi-surface-hover); }
  .captains-log button:disabled { opacity: .5; cursor: not-allowed; }
  .captains-log button:focus-visible, .captains-log summary:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
  .captains-log .captain-primary { border-color: var(--pi-accent-border); background: var(--pi-selection-bg); padding: 8px 12px; }
  .captains-log .captain-source { display: grid; gap: 3px; margin: 18px 0 12px; padding: 10px 12px; background: var(--pi-surface); border: 1px solid var(--pi-border-muted); border-radius: 8px; overflow-wrap: anywhere; }
  .captains-log .captain-source span { font-size: 11px; }
  .captains-log .captain-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 10px 0 16px; color: var(--pi-muted); font-size: 12px; }
  .captains-log .captain-notice { padding: 12px; margin-bottom: 12px; border: 1px solid var(--pi-warning-border); border-radius: 8px; background: var(--pi-warning-surface); overflow-wrap: anywhere; white-space: pre-wrap; }
  .captains-log .captain-notice p { margin-top: 6px; }
  .captains-log .captain-empty { padding: 16px 0; }
  .captains-log .captain-reply { padding: 16px 0; border-top: 1px solid var(--pi-border-muted); }
  .captains-log .captain-reply-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .captains-log time { color: var(--pi-muted); font-size: 11px; }
  .captains-log .captain-answer { line-height: 1.65; overflow-wrap: anywhere; min-width: 0; }
  .captains-log .captain-answer > :first-child { margin-top: 0; }
  .captains-log .captain-answer > :last-child { margin-bottom: 0; }
  .captains-log .captain-answer p, .captains-log .captain-answer ul, .captains-log .captain-answer ol { margin: .65em 0; }
  .captains-log .captain-answer h1, .captains-log .captain-answer h2, .captains-log .captain-answer h3,
  .captains-log .captain-answer h4, .captains-log .captain-answer h5, .captains-log .captain-answer h6 { margin: 1em 0 .4em; line-height: 1.3; }
  .captains-log .captain-answer h1 { font-size: 1.5em; }
  .captains-log .captain-answer h2 { font-size: 1.3em; }
  .captains-log .captain-answer h3 { font-size: 1.15em; }
  .captains-log .captain-answer ul, .captains-log .captain-answer ol { padding-left: 1.7em; }
  .captains-log .captain-answer blockquote { margin: .75em 0; padding-left: 1em; border-left: 3px solid var(--pi-border-muted); color: var(--pi-muted); }
  .captains-log .captain-answer code { font-family: monospace; background: var(--pi-surface); border-radius: 3px; padding: .1em .25em; }
  .captains-log .captain-answer pre { max-width: 100%; overflow: auto; padding: 12px; background: var(--pi-surface); border: 1px solid var(--pi-border-muted); border-radius: 6px; white-space: pre; overflow-wrap: normal; }
  .captains-log .captain-answer pre code { padding: 0; background: none; }
  .captains-log .captain-answer a { color: var(--pi-accent); text-decoration: underline; }
  .captains-log .captain-answer a:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
  .captains-log .captain-table-scroll { max-width: 100%; overflow: auto; margin: .75em 0; }
  .captains-log .captain-answer table { border-collapse: collapse; width: 100%; }
  .captains-log .captain-answer th, .captains-log .captain-answer td { border: 1px solid var(--pi-border-muted); padding: 6px 10px; text-align: left; }
  .captains-log .captain-answer th { background: var(--pi-surface); }
  .captains-log .captain-answer hr { border: 0; border-top: 1px solid var(--pi-border-muted); }
  .captains-log .captain-secondary { border-top: 1px solid var(--pi-border-muted); margin-top: 12px; padding-top: 6px; }
  .captains-log details { padding: 8px 0; }
  .captains-log summary { cursor: pointer; color: var(--pi-muted); }
  .captains-log details p { margin: 8px 0; overflow-wrap: anywhere; }
  .captains-log .captain-history { display: grid; gap: 6px; padding-top: 8px; }
  .captains-log .captain-history button { text-align: left; min-width: 0; }
  .captains-log dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; font-size: 11px; }
  .captains-log dd { margin: 0; overflow-wrap: anywhere; }
  .captains-log .captain-footnote { font-size: 11px; margin-top: 10px; }
`;
