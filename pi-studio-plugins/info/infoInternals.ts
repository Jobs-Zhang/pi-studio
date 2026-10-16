// Implementation details of the bundled Info plugin.
//
// This file is NOT part of the plugin skeleton. If you copied the Info plugin
// as a starting point for your own plugin, replace everything here with your
// own content — the plugin contract (metadata and contribution definitions)
// lives in pi-studio-plugin.ts.

import type { TemplateResult } from "lit";
import type { ApplicationPanelContext, HtmlTemplateTag, MachineKind, PiStudioComponentStatus, PiStudioInstallationInfo, PiStudioReleaseStatus, PiStudioStatusResponse, PluginMachine, PluginRuntimeContext, Workspace } from "@pi-studio/pi-studio/plugin-api";
import { t, type InfoMessageKey } from "./messages.js";

export type ComponentHealth = "current" | "restart needed" | "unavailable";

export function componentHealth(component: PiStudioComponentStatus): ComponentHealth {
  if (!component.available) return "unavailable";
  if (component.stale) return "restart needed";
  return "current";
}

function healthMessageKey(health: ComponentHealth): InfoMessageKey {
  switch (health) {
    case "current": return "health.current";
    case "restart needed": return "health.restartNeeded";
    case "unavailable": return "health.unavailable";
  }
}

export function formatVersion(version: string | undefined): string {
  return version === undefined || version === "" ? t("version.unknown") : version;
}

export function installationLabel(installation: PiStudioInstallationInfo | undefined): string {
  if (installation === undefined) return t("installation.unknown");
  if (installation.kind === "pi-package") {
    const scope = installation.scope === undefined ? "" : ` · ${installation.scope}`;
    const source = installation.source ?? t("installation.piPackage");
    return `${source}${scope}`;
  }
  if (installation.kind === "npm-global") return t("installation.npmGlobal");
  if (installation.kind === "local") return t("installation.local");
  if (installation.kind === "docker") return installation.dockerMode === "dev" ? t("installation.dockerDev") : t("installation.docker");
  return t("installation.unknown");
}

export function machineKindLabel(kind: MachineKind): string {
  return kind === "local" ? t("machine.local") : t("machine.remote");
}

export function releaseSummary(release: PiStudioReleaseStatus): string {
  if (release.updateAvailable) {
    return release.latestVersion === undefined || release.latestVersion === ""
      ? t("release.updateAvailable")
      : t("release.updateAvailableVersion", { version: release.latestVersion });
  }
  if (release.error !== undefined && release.error !== "") return t("release.checkFailed", { error: release.error });
  if (release.skipped === true) return t("release.checkSkipped");
  return t("release.upToDate");
}

/** One-line component summary used by the panel rows and the clipboard diagnostics. */
export function componentDetails(component: PiStudioComponentStatus): string {
  const parts = [
    t("component.running", { version: formatVersion(component.runtimeVersion) }),
    t("component.installed", { version: formatVersion(component.installedVersion) }),
    t("component.pi", { version: formatVersion(component.piVersion) }),
    t(healthMessageKey(componentHealth(component))),
    installationLabel(component.installation),
  ];
  if (component.installation?.path !== undefined && component.installation.path !== "") parts.push(component.installation.path);
  if (component.error !== undefined && component.error !== "") parts.push(t("component.error", { error: component.error }));
  return parts.join(" · ");
}

/** Note shown when the session daemon runs a different Pi version than the web process. */
export function piVersionDriftNote(web: PiStudioComponentStatus, sessiond: PiStudioComponentStatus): string | undefined {
  if (!sessiond.available) return undefined;
  if (web.piVersion === undefined || sessiond.piVersion === undefined) return undefined;
  return web.piVersion === sessiond.piVersion ? undefined : t("drift.sessionDaemon", { version: formatVersion(sessiond.piVersion) });
}

export function workspaceFlags(workspace: Workspace): string[] {
  return [
    workspace.provider === undefined ? t("flags.folder") : t("flags.provider", { id: workspace.provider.pluginId }),
    workspace.isMain ? t("flags.main") : undefined,
  ].filter((flag): flag is string => flag !== undefined);
}

export interface DiagnosticsInput {
  status: PiStudioStatusResponse | undefined;
  machine?: PluginMachine | undefined;
  workspace?: Workspace | undefined;
}

/** Plain-text status block suitable for pasting into a bug report. */
export function diagnosticsSummary({ status, machine, workspace }: DiagnosticsInput): string {
  const lines: string[] = [t("diagnostics.title")];
  if (status === undefined) {
    lines.push(t("diagnostics.statusUnavailable"));
  } else {
    lines.push(t("diagnostics.package", { name: status.packageName }));
    lines.push(`${status.components.web.label}: ${componentDetails(status.components.web)}`);
    lines.push(`${status.components.sessiond.label}: ${componentDetails(status.components.sessiond)}`);
    const checked = status.release.checkedAt === undefined || status.release.skipped === true ? "" : t("diagnostics.checked", { time: status.release.checkedAt });
    lines.push(t("diagnostics.release", { summary: releaseSummary(status.release), checked }));
    lines.push(t("diagnostics.statusGenerated", { time: status.generatedAt }));
  }
  if (machine !== undefined) lines.push(t("diagnostics.machine", { name: machine.name, kind: machineKindLabel(machine.kind) }));
  if (workspace === undefined) {
    lines.push(t("diagnostics.noWorkspace"));
  } else {
    lines.push(t("diagnostics.workspace", { label: workspace.label, path: workspace.path, flags: workspaceFlags(workspace).join(", ") }));
  }
  return lines.join("\n");
}

/** Action body: copy the diagnostics summary for the current runtime context. */
export async function copyDiagnostics(context: PluginRuntimeContext): Promise<void> {
  const summary = diagnosticsSummary({
    status: context.state.piStudioStatus,
    machine: context.state.selectedMachine,
    workspace: context.state.selectedWorkspace,
  });
  await navigator.clipboard.writeText(summary);
}

function renderComponent(html: HtmlTemplateTag, component: PiStudioComponentStatus): TemplateResult {
  const health = componentHealth(component);
  return html`
    <div class="info-component">
      <strong>${component.label}</strong>
      <span class=${health === "current" ? "info-health-ok" : "info-health-attention"}>${t(healthMessageKey(health))}</span>
      <small>${componentDetails(component)}</small>
    </div>
  `;
}

function renderStatusSection(html: HtmlTemplateTag, status: PiStudioStatusResponse | undefined): TemplateResult {
  if (status === undefined) {
    return html`
      <section>
        <strong>PI STUDIO</strong>
        <p class="muted">${t("status.unavailable")}</p>
      </section>
    `;
  }
  const web = status.components.web;
  const driftNote = piVersionDriftNote(web, status.components.sessiond);
  const messageCount = status.messages.length;
  return html`
    <section>
      <strong>PI STUDIO</strong>
      <div class="info-row">
        <span>${t("status.version")}</span>
        <span>${formatVersion(web.runtimeVersion)}</span>
        ${web.installedVersion === undefined || web.installedVersion === web.runtimeVersion ? null : html`<small>${t("component.installed", { version: formatVersion(web.installedVersion) })}</small>`}
      </div>
      <div class="info-row">
        <span>${t("status.pi")}</span>
        <span>${formatVersion(web.piVersion)}</span>
        ${driftNote === undefined ? null : html`<small>${driftNote}</small>`}
      </div>
      <div class="info-row">
        <span>${t("status.package")}</span>
        <span>${status.packageName}</span>
      </div>
      <div class="info-row">
        <span>${t("status.installation")}</span>
        <span>${installationLabel(web.installation)}</span>
        ${web.installation?.path === undefined || web.installation.path === "" ? null : html`<small>${web.installation.path}</small>`}
      </div>
      <div class="info-row">
        <span>${t("status.release")}</span>
        <span>${releaseSummary(status.release)}</span>
        ${status.release.checkedAt === undefined || status.release.skipped === true ? null : html`<small>${t("status.checked", { time: status.release.checkedAt })}</small>`}
      </div>
      ${messageCount === 0 ? null : html`<p class="muted">${messageCount === 1 ? t("status.messageCountOne", { count: messageCount }) : t("status.messageCountMany", { count: messageCount })}</p>`}
      <p class="muted">${t("status.generated", { time: status.generatedAt })}</p>
    </section>
    <section>
      <strong>${t("section.services")}</strong>
      ${renderComponent(html, status.components.web)}
      ${renderComponent(html, status.components.sessiond)}
    </section>
  `;
}

function renderMachineSection(html: HtmlTemplateTag, machine: PluginMachine): TemplateResult {
  return html`
    <section>
      <strong>${t("section.machine")}</strong>
      <div class="info-row">
        <span>${t("field.name")}</span>
        <span>${machine.name}</span>
      </div>
      <div class="info-row">
        <span>${t("field.type")}</span>
        <span>${machineKindLabel(machine.kind)}</span>
      </div>
    </section>
  `;
}

function renderWorkspaceSection(html: HtmlTemplateTag, workspace: Workspace): TemplateResult {
  return html`
    <section>
      <strong>${t("section.workspace")}</strong>
      <div class="info-row">
        <span>${t("field.name")}</span>
        <span>${workspace.label}</span>
      </div>
      <div class="info-row">
        <span>${t("field.path")}</span>
        <span class="info-path">${workspace.path}</span>
        ${workspaceFlags(workspace).length === 0 ? null : html`<small>${workspaceFlags(workspace).join(" · ")}</small>`}
      </div>
    </section>
  `;
}

/** Panel body: machine status is useful even without a selected workspace. */
export function renderInfoPanel(html: HtmlTemplateTag, context: ApplicationPanelContext): TemplateResult {
  return html`
    <style>
      .viewer.info-status { flex: 1 1 auto; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; padding: 12px; overflow-y: auto; overflow-x: hidden; }
      .viewer.info-status section { flex: 0 0 auto; min-width: 0; display: grid; gap: 8px; align-content: start; }
      .viewer.info-status p { margin: 0; }
      .info-row { display: grid; grid-template-columns: minmax(90px, auto) minmax(0, 1fr); gap: 3px 10px; border-bottom: 1px solid var(--pi-border-muted); padding: 6px 0; overflow-wrap: anywhere; }
      .info-row small { grid-column: 1 / -1; color: var(--pi-muted); }
      .info-component { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 10px; border-bottom: 1px solid var(--pi-border-muted); padding: 6px 0; }
      .info-component small { grid-column: 1 / -1; color: var(--pi-muted); overflow-wrap: anywhere; }
      .info-health-ok { color: var(--pi-success); }
      .info-health-attention { color: var(--pi-warning); }
    </style>
    <section class="toolbar"><strong>${t("panel.title")}</strong></section>
    <section class="viewer info-status">
      ${renderStatusSection(html, context.state.piStudioStatus)}
      ${renderMachineSection(html, context.machine)}
      ${context.workspace === undefined ? null : renderWorkspaceSection(html, context.workspace)}
    </section>
  `;
}
