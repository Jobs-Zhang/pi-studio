import { t } from "../../i18n";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { PiPackageInfo, PiPackageInstallableSuggestion, PiPackageScope, PiPackagesResponse } from "../../api";
import "./SettingsPanelFrame";
import type { SettingsNotice } from "./SettingsPanelFrame";
import { isPiPackageOperationPending, normalizePiPackageSource, piPackageFilteredLabel, piPackageInstalledPathLabel, piPackageScopeLabel, piPackageSourceValidationMessage, piPackageTargetContext, piPackageTargetLabel, piPackageUpdateDisabledReason, updateAllPiPackagesDisabledReason, type PiPackageOperationState, type PiPackageTargetContext } from "./piPackageSettings";

@customElement("settings-packages-panel")
export class SettingsPackagesPanel extends LitElement {
  @property({ attribute: false }) packagesResponse: PiPackagesResponse | undefined;
  @property({ type: Boolean }) loading = false;
  @property({ attribute: false }) operation: PiPackageOperationState | undefined;
  @property({ attribute: false }) targetMachine: PiPackageTargetContext | undefined;
  @property() error = "";
  @property() operationMessage = "";
  @property({ attribute: false }) onReload?: () => void | Promise<void>;
  @property({ attribute: false }) onInstallPackage?: (source: string) => void | Promise<void>;
  @property({ attribute: false }) onRemovePackage?: (source: string, scope: PiPackageScope) => void | Promise<void>;
  @property({ attribute: false }) onUpdatePackage?: (source?: string) => void | Promise<void>;
  @state() private installSource = "";
  @state() private validationMessage = "";

  override render(): TemplateResult {
    const packages = this.packagesResponse?.packages ?? [];
    const target = this.packageTarget;
    const targetLabel = piPackageTargetLabel(target);
    const showPackageControls = this.packagesResponse !== undefined;
    return html`
      <settings-panel-frame
        heading=${t("packagesPanel.heading")}
        .description=${packagesDescription(targetLabel)}
        actionLabel=${t("common.reload")}
        actionTitle=${`Reload Pi packages from ${targetLabel}`}
        .actionDisabled=${this.loading || this.isOperating}
        .notices=${this.panelNotices(showPackageControls)}
        .onAction=${this.onReload}
      >
        ${this.renderPanelContent(packages, target, targetLabel)}
      </settings-panel-frame>
    `;
  }

  private panelNotices(showTrustedCodeWarning: boolean): readonly SettingsNotice[] {
    const notices: SettingsNotice[] = [];
    if (this.error !== "") {
      notices.push({ type: "error", content: this.error });
    }
    if (this.operationMessage !== "") notices.push({ type: "success", content: this.operationMessage });
    if (showTrustedCodeWarning) {
      notices.push({
        type: "security",
        content: html`<strong>${t("packagesPanel.trustedHeading")}:</strong> ${t("packagesPanel.trustedDetail")}`,
      });
    }
    return notices;
  }

  private renderPanelContent(packages: PiPackageInfo[], target: PiPackageTargetContext, targetLabel: string): TemplateResult | null {
    if (this.packagesResponse === undefined) {
      return html`<div class="loading-card">${this.loading ? `Loading Pi packages from ${targetLabel}…` : `Pi package list unavailable for ${targetLabel}. Use Reload to try again.`}</div>`;
    }
    return html`
      ${this.renderInstallableKnownPackages(targetLabel)}
      ${this.renderInstallForm(targetLabel)}
      ${this.renderPackageList(packages, target)}
    `;
  }

  private renderInstallableKnownPackages(targetLabel: string): TemplateResult | null {
    const suggestions = this.packagesResponse?.installableKnownPackages ?? [];
    if (suggestions.length === 0) return null;
    return html`
      <section class="known-package-section" aria-label=${t("packagesPanel.availableAria")}>
        <h3>${t("packagesPanel.available")}</h3>
        <p>${t("packagesPanel.availableDetail", { target: targetLabel })}</p>
        <div class="known-package-list">
          ${suggestions.map((suggestion) => this.renderInstallableKnownPackage(suggestion))}
        </div>
      </section>
    `;
  }

  private renderInstallableKnownPackage(suggestion: PiPackageInstallableSuggestion): TemplateResult {
    const installing = isPiPackageOperationPending(this.operation, "install", suggestion.source);
    return html`
      <article class="known-package-card">
        <div class="package-main">
          <strong>${suggestion.label}</strong>
          <small>${suggestion.description}</small>
        </div>
        <button title=${t("packagesPanel.installNamed", { name: suggestion.label })} ?disabled=${this.isOperating} @click=${() => { void this.installKnownPackage(suggestion.source); }}>${installing ? t("packagesPanel.installing") : t("packagesPanel.install")}</button>
      </article>
    `;
  }

  private renderInstallForm(targetLabel: string): TemplateResult {
    return html`
      <form class="install-card" @submit=${(event: Event) => { void this.installPackage(event); }}>
        <label for="package-source">${t("packagesPanel.source")}</label>
        <div class="install-row">
          <input id="package-source" .value=${this.installSource} ?disabled=${this.isOperating} placeholder=${t("packagesPanel.sourcePlaceholder")} @input=${(event: Event) => { this.updateInstallSource(event); }}>
          <button type="submit" title=${t("packagesPanel.installHint")} ?disabled=${this.isOperating}>${isPiPackageOperationPending(this.operation, "install") ? t("packagesPanel.installing") : t("packagesPanel.install")}</button>
        </div>
        ${this.validationMessage === "" ? null : html`<div class="field-error">${this.validationMessage}</div>`}
        <small>${t("packagesPanel.installDetail", { target: targetLabel })}</small>
      </form>
    `;
  }

  private renderPackageList(packages: PiPackageInfo[], target: PiPackageTargetContext): TemplateResult {
    const targetLabel = piPackageTargetLabel(target);
    const updateAllReason = updateAllPiPackagesDisabledReason(packages);
    const showUpdateAllReason = updateAllReason !== undefined && packages.length > 0;
    const updateAllTitle = updateAllReason ?? t("packagesPanel.updateAllHint");
    return html`
      <section class="package-section" aria-label=${t("packagesPanel.configuredAria")}>
        <div class="package-toolbar">
          <div>
            <h3>${t("packagesPanel.configured")}</h3>
            <p>${t("packagesPanel.configuredDetail", { target: targetLabel })}</p>
          </div>
          <button class="secondary" title=${updateAllTitle} ?disabled=${this.isOperating || updateAllReason !== undefined} @click=${() => { void this.updatePackage(); }}>
            ${isPiPackageOperationPending(this.operation, "update-all") ? t("packagesPanel.updating") : t("packagesPanel.updateAll")}
          </button>
        </div>
        ${showUpdateAllReason ? html`<div class="action-note">${updateAllReason}</div>` : null}
        ${this.loading && packages.length > 0 ? html`<div class="action-note">${t("packagesPanel.refreshing", { target: targetLabel })}</div>` : null}
        ${this.renderPackageListContent(packages, targetLabel)}
      </section>
    `;
  }

  private renderPackageListContent(packages: PiPackageInfo[], targetLabel: string): TemplateResult {
    if (this.loading && packages.length === 0) return html`<div class="loading-card">${t("packagesPanel.loading", { target: targetLabel })}</div>`;
    if (packages.length === 0) return html`<div class="loading-card">${t("packagesPanel.none", { target: targetLabel })}</div>`;
    return html`
      <div class="package-list">
        ${packages.map((packageInfo) => this.renderPackage(packageInfo))}
      </div>
    `;
  }

  private renderPackage(packageInfo: PiPackageInfo): TemplateResult {
    const updateReason = piPackageUpdateDisabledReason(packageInfo);
    const updating = isPiPackageOperationPending(this.operation, "update", packageInfo.source);
    const removing = isPiPackageOperationPending(this.operation, "remove", packageInfo.source);
    return html`
      <article class=${`package-card${packageInfo.filtered ? " filtered" : ""}`}>
        <div class="package-main">
          <strong>${packageInfo.source}</strong>
          <small>${piPackageScopeLabel(packageInfo)} · ${piPackageFilteredLabel(packageInfo)}</small>
          <small>${t("packagesPanel.installedPath")}: <code>${piPackageInstalledPathLabel(packageInfo)}</code></small>
          ${updateReason === undefined ? null : html`<small class="action-note">${updateReason}</small>`}
        </div>
        <div class="package-actions">
          <button class="secondary" title=${updateReason ?? t("packagesPanel.updateHint")} ?disabled=${this.isOperating || updateReason !== undefined} @click=${() => { void this.updatePackage(packageInfo.source); }}>${updating ? t("packagesPanel.updating") : t("packagesPanel.update")}</button>
          <button class="danger" title=${t("packagesPanel.removeHint")} ?disabled=${this.isOperating} @click=${() => { void this.removePackage(packageInfo); }}>${removing ? t("packagesPanel.removing") : t("packagesPanel.remove")}</button>
        </div>
      </article>
    `;
  }

  private updateInstallSource(event: Event): void {
    this.installSource = event.target instanceof HTMLInputElement ? event.target.value : "";
    this.validationMessage = "";
  }

  private async installPackage(event: Event): Promise<void> {
    event.preventDefault();
    const validationMessage = piPackageSourceValidationMessage(this.installSource);
    if (validationMessage !== undefined) {
      this.validationMessage = validationMessage;
      return;
    }

    const source = normalizePiPackageSource(this.installSource);
    try {
      await this.onInstallPackage?.(source);
      this.installSource = "";
      this.validationMessage = "";
    } catch {
      // The parent owns network error presentation so package errors are consistent across Settings.
    }
  }

  private async removePackage(packageInfo: PiPackageInfo): Promise<void> {
    try {
      await this.onRemovePackage?.(packageInfo.source, packageInfo.scope);
    } catch {
      // The parent owns network error presentation so package errors are consistent across Settings.
    }
  }

  private async installKnownPackage(source: string): Promise<void> {
    try {
      await this.onInstallPackage?.(source);
    } catch {
      // The parent owns network error presentation so package errors are consistent across Settings.
    }
  }

  private async updatePackage(source?: string): Promise<void> {
    try {
      await this.onUpdatePackage?.(source);
    } catch {
      // The parent owns network error presentation so package errors are consistent across Settings.
    }
  }

  private get packageTarget(): PiPackageTargetContext {
    return this.targetMachine ?? piPackageTargetContext(undefined);
  }

  private get isOperating(): boolean {
    return this.operation !== undefined;
  }

  static override styles = css`
    :host { display: block; }
    .package-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .package-toolbar > div, .package-main { display: grid; gap: 6px; min-width: 0; }
    h3, p { margin: 0; }
    h3 { font-size: 15px; line-height: 1.25; }
    p, small { color: var(--pi-muted); line-height: 1.45; }
    button, input { font: inherit; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
    button:disabled, input:disabled { opacity: .55; cursor: not-allowed; }
    input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); color: var(--pi-text); padding: 8px 9px; }
    label { font-weight: 700; }
    .secondary { flex: 0 0 auto; }
    .danger { border-color: color-mix(in srgb, var(--pi-danger) 55%, var(--pi-border)); color: var(--pi-danger); }
    .loading-card, .install-card, .package-card { border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); padding: 12px; }
    .field-error { color: var(--pi-danger); font-size: 12px; }
    .install-card { display: grid; gap: 8px; }
    .install-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    .package-section { display: block; }
    .known-package-section { display: grid; gap: 8px; margin-bottom: 14px; }
    .known-package-list { display: grid; gap: 10px; }
    .known-package-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); padding: 12px; }
    .loading-card, .action-note { color: var(--pi-muted); }
    .action-note { margin-bottom: 10px; font-size: 12px; }
    .package-list { display: grid; gap: 10px; }
    .package-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; }
    .package-card.filtered { opacity: .82; }
    .package-main strong, .package-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .package-actions { display: flex; align-items: center; gap: 8px; }
    code { border: 1px solid var(--pi-border-muted); border-radius: 5px; background: var(--pi-bg); padding: 1px 4px; color: var(--pi-text); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }

    @media (max-width: 760px) {
      .package-toolbar { display: grid; gap: 12px; }
      .package-toolbar .secondary { justify-self: start; }
      .install-row, .package-card, .known-package-card { grid-template-columns: minmax(0, 1fr); align-items: start; }
      .package-actions { justify-self: start; flex-wrap: wrap; }
      .package-main strong, .package-main small { white-space: normal; }
    }
  `;
}

function packagesDescription(targetLabel: string): TemplateResult {
  return html`Managing Pi packages on <strong>${targetLabel}</strong>. Install, remove, and update packages managed by Pi on the selected machine. Pi packages can provide extensions, skills, prompt templates, themes, context/system prompt files, and PI STUDIO browser plugins.`;
}
