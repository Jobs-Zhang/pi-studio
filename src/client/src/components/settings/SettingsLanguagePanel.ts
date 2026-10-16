import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { DEFAULT_LOCALE_PREFERENCE, localeDisplayName, parseLocalePreference, resolveLocale, type PiStudioLocale, type PiStudioLocalePreference } from "../../../../shared/i18n/locale";
import { applyLocalePreference, readLocalePreference, t } from "../../i18n";

/**
 * Device-local language choice, next to the theme: PI STUDIO's own interface
 * follows the browser language until the user pins a supported locale here.
 */
@customElement("settings-language-panel")
export class SettingsLanguagePanel extends LitElement {
  /** Device-local, so the panel reads it directly instead of routing it through app state. */
  @property({ attribute: false }) preference: PiStudioLocalePreference = readLocalePreference();
  @property({ attribute: false }) activeLocale: PiStudioLocale = "en";

  override render(): TemplateResult {
    const detected = resolveLocale(DEFAULT_LOCALE_PREFERENCE, globalThis.navigator.languages);
    return html`
      <section class="language-card" aria-labelledby="language-heading">
        <header>
          <h3 id="language-heading">${t("language.heading")}</h3>
          <p>${t("language.description")}</p>
        </header>
        <div class="current-language" role="status">
          <span>${t("language.current", { language: localeDisplayName(this.activeLocale) })}</span>
        </div>
        <label class="field">
          <span>${t("language.fieldLabel")}</span>
          <select aria-label=${t("language.fieldLabel")} .value=${this.preference} @change=${(event: Event) => {
            if (event.target instanceof HTMLSelectElement) changeLocalePreference(event.target.value);
          }}>
            <option value="auto">${t("language.modeAuto", { language: localeDisplayName(detected) })}</option>
            <option value="en">${localeDisplayName("en")}</option>
            <option value="zh-CN">${localeDisplayName("zh-CN")}</option>
          </select>
        </label>
        <p class="hint">${t("language.hint")}</p>
      </section>
    `;
  }

  static override styles = css`
    :host { display: block; }
    .language-card { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); }
    header { display: grid; gap: 6px; }
    h3, p { margin: 0; }
    h3 { font-size: 15px; }
    p { color: var(--pi-muted); line-height: 1.45; }
    .current-language { padding: 12px; border: 1px solid var(--pi-border-muted); border-radius: 8px; background: var(--pi-bg); }
    .current-language span { color: var(--pi-text-secondary); font-size: 12px; }
    .field { display: grid; gap: 7px; }
    .field > span { color: var(--pi-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    select { box-sizing: border-box; width: 100%; border: 1px solid var(--pi-border); border-radius: 8px; padding: 9px 10px; background: var(--pi-bg); color: var(--pi-text); font: var(--pi-control-font-size, 16px) system-ui, sans-serif; }
    select:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
    .hint { font-size: 12px; }
  `;
}

function changeLocalePreference(value: string): void {
  const preference = parseLocalePreference(value);
  if (preference !== undefined) applyLocalePreference(preference);
}
