import { t } from "../i18n";
import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { MachineConnectionInput } from "../../../shared/apiTypes";
import "./ModalSurface";

export interface MachineDialogSubmit {
  name: string;
  baseUrl: string;
  connection: MachineConnectionInput;
  token?: string;
}

@customElement("machine-dialog")
export class MachineDialog extends LitElement {
  @property({ attribute: false }) onSubmit?: (input: MachineDialogSubmit) => void | Promise<void>;
  @property({ attribute: false }) onCancel?: () => void;
  /** Supplies ~/.ssh/config host aliases for the SSH host autocomplete. */
  @property({ attribute: false }) onLoadSshHosts?: () => Promise<string[]>;
  @property() error = "";

  @state() private url = "";
  @state() private name = "";
  @state() private token = "";
  @state() private mode: "direct" | "ssh" = "direct";
  @state() private sshVia: "config" | "manual" = "config";
  @state() private sshHost = "";
  @state() private sshPort = "";
  @state() private sshUser = "";
  @state() private sshIdentityFile = "";
  @state() private sshPassword = "";
  @state() private sshHosts: string[] = [];
  @state() private submitting = false;
  @query("input[name='name']") private nameInput?: HTMLInputElement;

  private nameEdited = false;
  private previousSuggestedName = "";
  private sshHostsRequested = false;

  private switchMode(mode: "direct" | "ssh"): void {
    this.mode = mode;
    if (mode === "ssh" && !this.sshHostsRequested) {
      this.sshHostsRequested = true;
      void this.onLoadSshHosts?.().then((hosts) => {
        if (this.isConnected) {
          this.sshHosts = hosts;
          if (hosts.length > 0 && this.sshHost === "") this.sshHost = hosts[0] ?? "";
          if (hosts.length === 0) this.sshVia = "manual";
        }
      });
    }
  }

  private handleUrlInput(event: InputEvent): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const url = event.target.value;
    const suggestedName = suggestedMachineNameFromUrl(url);
    if (!this.nameEdited || this.name.trim() === "" || this.name === this.previousSuggestedName) this.name = suggestedName;
    this.previousSuggestedName = suggestedName;
    this.url = url;
  }

  private handleNameInput(event: InputEvent): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.nameEdited = true;
    this.name = event.target.value;
  }

  private handleTokenInput(event: InputEvent): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.token = event.target.value;
  }

  // Escape and backdrop presses are owned by the modal surface (routed to
  // `onCancel`); this handler keeps the form's Enter-to-advance behavior.
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.name === "baseUrl" && machineBaseUrlValidationMessage(this.url) === undefined) {
      event.preventDefault();
      void this.updateComplete.then(() => {
        this.nameInput?.focus();
        this.nameInput?.select();
      });
    }
  }

  private handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    void this.submit();
  }

  private async submit(): Promise<void> {
    const input = this.validInput();
    if (input === undefined || this.submitting) return;
    this.submitting = true;
    try {
      await this.onSubmit?.(input);
    } finally {
      if (this.isConnected) this.submitting = false;
    }
  }

  private validInput(): MachineDialogSubmit | undefined {
    const baseUrl = this.url.trim();
    const name = this.name.trim() || (this.mode === "ssh" ? this.sshHost.trim() : suggestedMachineNameFromUrl(baseUrl));
    if (baseUrl === "" || name === "" || machineBaseUrlValidationMessage(baseUrl) !== undefined) return undefined;
    const connection = this.validConnection();
    if (connection === undefined) return undefined;
    const token = this.token.trim();
    return { name, baseUrl, connection, ...(token === "" ? {} : { token }) };
  }

  private validConnection(): MachineConnectionInput | undefined {
    if (this.mode === "direct") return { mode: "direct" };
    if (this.sshHost.trim() === "") return undefined;
    if (this.sshVia === "config") return { mode: "ssh", ssh: { host: this.sshHost.trim() } };
    if (this.sshIdentityFile.trim() !== "" && this.sshPassword !== "") return undefined;
    if (this.sshPort !== "" && (!Number.isInteger(Number(this.sshPort)) || Number(this.sshPort) < 1 || Number(this.sshPort) > 65535)) return undefined;
    return {
      mode: "ssh",
      ssh: {
        host: this.sshHost.trim(),
        ...(this.sshPort.trim() === "" ? {} : { port: Number(this.sshPort.trim()) }),
        ...(this.sshUser.trim() === "" ? {} : { user: this.sshUser.trim() }),
        ...(this.sshIdentityFile.trim() === "" ? {} : { identityFile: this.sshIdentityFile.trim() }),
        ...(this.sshPassword === "" ? {} : { password: this.sshPassword }),
      },
    };
  }

  private handleSshInput(event: InputEvent, field: "host" | "port" | "user" | "identityFile" | "password"): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const value = event.target.value;
    if (field === "host") this.sshHost = value;
    else if (field === "port") this.sshPort = value;
    else if (field === "user") this.sshUser = value;
    else if (field === "identityFile") this.sshIdentityFile = value;
    else this.sshPassword = value;
  }

  override render() {
    const hasUrl = this.url.trim() !== "";
    const urlError = hasUrl ? machineBaseUrlValidationMessage(this.url) : undefined;
    const canSubmit = this.validInput() !== undefined && !this.submitting;
    const authConflict = this.mode === "ssh" && this.sshIdentityFile.trim() !== "" && this.sshPassword !== "";
    return html`
      <modal-surface
        .onClose=${() => this.onCancel?.()}
        .initialFocus=${"input[name='baseUrl']"}
        .label=${t("machineDialog.title")}
        @keydown=${(event: KeyboardEvent) => { this.handleKeyDown(event); }}
      >
        <form @submit=${(event: SubmitEvent) => { this.handleSubmit(event); }}>
          <header>
            <strong>${t("machineDialog.title")}</strong>
            <button type="button" @click=${() => { this.onCancel?.(); }} aria-label=${t("common.close")}>×</button>
          </header>
          <div class="body">
            ${this.error === "" ? null : html`<div class="dialog-error" role="alert">${this.error}</div>`}
            <label>
              ${t("machineDialog.gatewayAddress")}
              <input name="baseUrl" type="url" .value=${this.url} @input=${(event: InputEvent) => { this.handleUrlInput(event); }} placeholder=${this.mode === "ssh" ? "http://127.0.0.1:8505" : "http://dev-box.local:8504"} autocomplete="url" inputmode="url" />
            </label>
            <small class=${urlError === undefined ? "hint" : "field-error"}>${urlError ?? (this.mode === "ssh" ? t("machineDialog.urlHintSsh") : t("machineDialog.urlHint"))}</small>
            <fieldset class="connection-mode">
              <legend>${t("machineDialog.connectionMode")}</legend>
              <label class="mode-option">
                <input type="radio" name="connectionMode" value="direct" .checked=${this.mode === "direct"} @change=${() => { this.switchMode("direct"); }} />
                <span>${t("machineDialog.direct")}</span>
              </label>
              <label class="mode-option">
                <input type="radio" name="connectionMode" value="ssh" .checked=${this.mode === "ssh"} @change=${() => { this.switchMode("ssh"); }} />
                <span>${t("machineDialog.ssh")}</span>
              </label>
            </fieldset>
            ${this.mode === "ssh" ? html`
              <div class="ssh-grid">
                <button type="button" @click=${() => { this.sshVia = "config"; this.sshHost = this.sshHosts[0] ?? ""; }}>${t("machineDialog.sshConfig")}</button>
                <button type="button" @click=${() => { this.sshVia = "manual"; this.sshHost = ""; }}>${t("machineDialog.sshManual")}</button>
              </div>
              ${this.sshVia === "config" ? html`
                <label>${t("machineDialog.sshHostConfig")}
                  <select .value=${this.sshHost} @change=${(event: Event) => { if (event.target instanceof HTMLSelectElement) this.sshHost = event.target.value; }}>
                    ${this.sshHosts.map((host) => html`<option value=${host}>${host}</option>`)}
                  </select>
                </label>
                <small class="hint">${t("machineDialog.sshConfigHint")}</small>
              ` : html`
              <label>
                ${t("machineDialog.sshHost")} <span class="optional">${t("machineDialog.required")}</span>
                <input name="sshHost" type="text" list="ssh-config-hosts" .value=${this.sshHost} @input=${(event: InputEvent) => { this.handleSshInput(event, "host"); }} placeholder=${t("machineDialog.sshHostPlaceholder")} autocomplete="off" />
              </label>
              <small class="hint">${t("machineDialog.sshManualHint")}</small>
              <div class="ssh-grid">
                <label>
                  ${t("machineDialog.port")} <span class="optional">${t("machineDialog.optional")}</span>
                  <input name="sshPort" type="text" inputmode="numeric" .value=${this.sshPort} @input=${(event: InputEvent) => { this.handleSshInput(event, "port"); }} placeholder="22" autocomplete="off" />
                </label>
                <label>
                  ${t("machineDialog.user")} <span class="optional">${t("machineDialog.optional")}</span>
                  <input name="sshUser" type="text" .value=${this.sshUser} @input=${(event: InputEvent) => { this.handleSshInput(event, "user"); }} placeholder=${t("machineDialog.sshUserPlaceholder")} autocomplete="off" />
                </label>
              </div>
              <label>
                ${t("machineDialog.identityFile")} <span class="optional">${t("machineDialog.optional")}</span>
                <input name="sshIdentityFile" type="text" .value=${this.sshIdentityFile} @input=${(event: InputEvent) => { this.handleSshInput(event, "identityFile"); }} placeholder=${t("machineDialog.identityPlaceholder")} autocomplete="off" />
              </label>
              <label>
                ${t("machineDialog.password")} <span class="optional">${t("machineDialog.optional")}</span>
                <input name="sshPassword" type="password" .value=${this.sshPassword} @input=${(event: InputEvent) => { this.handleSshInput(event, "password"); }} placeholder=${t("machineDialog.sshPasswordPlaceholder")} autocomplete="off" />
              </label>
              <small class=${authConflict ? "field-error" : "hint"}>${authConflict ? t("machineDialog.authConflict") : t("machineDialog.passwordHint")}</small>
              `}
            ` : null}
            ${hasUrl ? html`
              <label>
                ${t("machineDialog.machineName")}
                <input name="name" type="text" .value=${this.name} @input=${(event: InputEvent) => { this.handleNameInput(event); }} placeholder=${this.previousSuggestedName || t("machineDialog.namePlaceholder")} autocomplete="off" />
              </label>
              <small class="hint">${t("machineDialog.nameHint")}</small>
              <label>
                ${t("machineDialog.bearerToken")} <span class="optional">${t("machineDialog.optional")}</span>
                <input name="token" type="password" .value=${this.token} @input=${(event: InputEvent) => { this.handleTokenInput(event); }} placeholder=${t("machineDialog.tokenPlaceholder")} autocomplete="off" />
              </label>
              <small class="hint">${t("machineDialog.tokenHint")}</small>
            ` : html`<p class="hint intro">${t("machineDialog.introHint")}</p>`}
          </div>
          <footer>
            <button type="button" @click=${() => { this.onCancel?.(); }}>${t("common.cancel")}</button>
            <button class="primary" type="submit" ?disabled=${!canSubmit}>${this.submitting ? t("machineDialog.submitting") : t("machineDialog.title")}</button>
          </footer>
        </form>
      </modal-surface>
    `;
  }

  static override styles = css`
    :host { position: fixed; inset: 0; z-index: 30; color: var(--pi-text); font: 14px system-ui, sans-serif; }
    modal-surface { --modal-surface-place-items: start center; --modal-surface-backdrop-padding: min(12dvh, 90px) 0 max(20px, env(safe-area-inset-bottom)); --modal-surface-width: min(560px, calc(100vw - 40px)); --modal-surface-max-height: min(640px, 100%); }
    /* The form is the surface's single slotted child: the section's flex column
       constrains it (min-height: 0 so the body can shrink and scroll). */
    form { display: flex; flex-direction: column; min-height: 0; }
    header, footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-bottom: 1px solid var(--pi-border); }
    footer { border-top: 1px solid var(--pi-border); border-bottom: 0; justify-content: end; }
    .body { display: grid; gap: 8px; padding: 12px; min-height: 0; overflow: auto; }
    label { display: grid; gap: 6px; color: var(--pi-muted); }
    select { width: 100%; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); color: var(--pi-text); padding: 9px; font: inherit; }
    input { box-sizing: border-box; width: 100%; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); color: var(--pi-text); padding: 9px; font: var(--pi-control-font-size, 16px) var(--pi-control-monospace-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); }
    input:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 1px; }
    .hint { color: var(--pi-muted); }
    .intro { margin: 4px 0 0; line-height: 1.4; }
    .optional { color: var(--pi-muted); font-weight: 400; }
    .field-error { color: var(--pi-danger); }
    fieldset.connection-mode { display: grid; gap: 6px; border: 1px solid var(--pi-border); border-radius: 8px; padding: 10px 12px; margin: 0; color: var(--pi-muted); }
    fieldset.connection-mode legend { padding: 0 4px; }
    .mode-option { display: flex; align-items: center; gap: 8px; color: var(--pi-text); }
    .mode-option input { width: auto; }
    .ssh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .dialog-error { border: 1px solid var(--pi-danger); border-radius: 8px; background: color-mix(in srgb, var(--pi-danger) 10%, transparent); color: var(--pi-danger); padding: 9px; line-height: 1.35; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
    header button { border: 0; background: transparent; color: var(--pi-muted); font-size: 22px; padding: 0 8px; }
    .primary { border-color: var(--pi-success-border); background: var(--pi-success-border); }
    button:disabled { opacity: .5; cursor: not-allowed; }
  `;
}

export function suggestedMachineNameFromUrl(value: string): string {
  const raw = value.trim();
  if (raw === "") return "";
  const parsed = parseUrlForSuggestion(raw) ?? parseUrlForSuggestion(`http://${raw.replace(/^\/+/u, "")}`);
  if (parsed !== undefined && parsed.hostname !== "") return parsed.hostname.replace(/^\[(.*)\]$/u, "$1");
  return fallbackSuggestedName(raw);
}

export function machineBaseUrlValidationMessage(value: string): string | undefined {
  const raw = value.trim();
  if (raw === "") return t("machineDialog.errorRequired");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return t("machineDialog.errorInvalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return t("machineDialog.errorProtocol");
  if (url.username !== "" || url.password !== "") return t("machineDialog.errorCredentials");
  if (url.search !== "" || url.hash !== "") return t("machineDialog.errorQuery");
  return undefined;
}

function parseUrlForSuggestion(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function fallbackSuggestedName(value: string): string {
  const withoutProtocol = value.replace(/^[a-z][a-z\d+.-]*:\/\//iu, "");
  const withoutCredentials = withoutProtocol.slice(withoutProtocol.lastIndexOf("@") + 1);
  const host = withoutCredentials.split(/[/?#]/u)[0] ?? "";
  if (host.startsWith("[") && host.includes("]")) return host.slice(1, host.indexOf("]"));
  return host.replace(/:\d+$/u, "");
}
