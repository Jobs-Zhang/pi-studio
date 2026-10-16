import { t } from "../../i18n";
import { css, html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { QualifiedThemeContribution } from "../../plugins/types";
import { DEFAULT_THEME_PREFERENCE, type ThemePreference } from "../../theme";

@customElement("settings-theme-panel")
export class SettingsThemePanel extends LitElement {
  @property({ attribute: false }) themes: readonly QualifiedThemeContribution[] = [];
  @property({ attribute: false }) preference: ThemePreference = DEFAULT_THEME_PREFERENCE;
  @property({ attribute: false }) defaultPreference: ThemePreference = DEFAULT_THEME_PREFERENCE;
  @property() activeThemeId = "";
  @property({ type: Boolean }) hasLocalOverride = false;
  @property({ type: Boolean }) loading = false;
  @property({ type: Boolean }) saving = false;
  @property({ attribute: false }) onUseLocal?: (preference: ThemePreference) => void;
  @property({ attribute: false }) onSetDefault?: (preference: ThemePreference) => void | Promise<void>;
  @property({ attribute: false }) onUseDefault?: () => void;
  @state() private draft: ThemePreference = { ...DEFAULT_THEME_PREFERENCE };

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("preference")) this.draft = { ...this.preference };
  }

  override render(): TemplateResult {
    const selectedAvailable = this.themes.some((theme) => theme.id === this.draft.themeId);
    const busy = this.loading || this.saving;
    return html`
      <section class="theme-card" aria-labelledby="theme-heading">
        <header>
          <h3 id="theme-heading">${t("theme.heading")}</h3>
          <p>${t("theme.description")}</p>
        </header>
        <div class="current-theme" role="status">
          <strong>${this.hasLocalOverride ? t("theme.usingLocal") : t("theme.usingDefault")}</strong>
          <span>Current: ${this.themeName(this.activeThemeId || this.preference.themeId)}</span>
          <span>Default: ${this.themeName(this.defaultPreference.themeId)}${this.defaultPreference.auto ? " · Auto" : ""}</span>
        </div>
        <label class="field">
          <span>${t("theme.heading")}</span>
          <select aria-label=${t("theme.heading")} .value=${this.draft.themeId} ?disabled=${busy} @change=${(event: Event) => {
            if (event.target instanceof HTMLSelectElement) this.draft = { ...this.draft, themeId: event.target.value };
          }}>
            ${!selectedAvailable ? html`<option value=${this.draft.themeId}>${this.draft.themeId} (unavailable)</option>` : null}
            ${this.themes.map((theme) => html`<option value=${theme.id}>${theme.name}</option>`)}
          </select>
        </label>
        <label class="auto-field">
          <input type="checkbox" .checked=${this.draft.auto} ?disabled=${busy} @change=${(event: Event) => {
            if (event.target instanceof HTMLInputElement) this.draft = { ...this.draft, auto: event.target.checked };
          }}>
          <span>${t("theme.auto")} <small>${t("theme.autoDetail")}</small></span>
        </label>
        <div class="theme-actions">
          <button class="primary" ?disabled=${busy || !selectedAvailable} @click=${() => this.onUseLocal?.({ ...this.draft })}>${t("theme.useOnDevice")}</button>
          <button ?disabled=${busy || !selectedAvailable} @click=${() => { void this.onSetDefault?.({ ...this.draft }); }}>${t("theme.setAsDefault")}</button>
          <button ?disabled=${busy || !this.hasLocalOverride} @click=${() => this.onUseDefault?.()}>${t("theme.useDefault")}</button>
        </div>
        <p class="hint">${t("theme.hint")}</p>
      </section>
    `;
  }

  private themeName(id: string): string {
    return this.themes.find((theme) => theme.id === id)?.name ?? `${id} (unavailable)`;
  }

  static override styles = css`
    :host { display: block; }
    .theme-card { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); }
    header { display: grid; gap: 6px; }
    h3, p { margin: 0; }
    h3 { font-size: 15px; }
    p, small { color: var(--pi-muted); line-height: 1.45; }
    .current-theme { display: grid; gap: 5px; padding: 12px; border: 1px solid var(--pi-border-muted); border-radius: 8px; background: var(--pi-bg); }
    .current-theme span { color: var(--pi-text-secondary); font-size: 12px; overflow-wrap: anywhere; }
    .field { display: grid; gap: 7px; }
    .field > span { color: var(--pi-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    select { box-sizing: border-box; width: 100%; border: 1px solid var(--pi-border); border-radius: 8px; padding: 9px 10px; background: var(--pi-bg); color: var(--pi-text); font: var(--pi-control-font-size, 16px) system-ui, sans-serif; }
    .auto-field { display: flex; align-items: flex-start; gap: 9px; }
    .auto-field input { margin-top: 3px; accent-color: var(--pi-accent); }
    .auto-field span { display: grid; gap: 3px; }
    .theme-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); color: var(--pi-text); padding: 8px 11px; font: inherit; cursor: pointer; }
    button:hover { background: var(--pi-surface-hover); }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
    .primary { border-color: var(--pi-accent); background: var(--pi-selection-bg); color: var(--pi-text-bright); }
    button:disabled, select:disabled, input:disabled { opacity: .55; cursor: not-allowed; }
    .hint { font-size: 12px; }
  `;
}
