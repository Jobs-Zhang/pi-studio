import { t } from "../i18n";
import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";

export interface ImageOpenDetail {
  src: string;
  alt: string;
}

/** Native image states and controls only; the owner decides when a source may be assigned. */
@customElement("pi-studio-image-presentation")
export class ImagePresentation extends LitElement {
  @property({ attribute: false }) source: string | undefined;
  @property() description = "";
  @property() label = "";
  @state() private phase: "loading" | "loaded" | "error" = "loading";

  override willUpdate(changed: PropertyValues): void {
    if (changed.has("source")) this.phase = "loading";
    if (changed.has("source") || changed.has("phase")) {
      // Capture while the previous shell/image is still in the DOM. The paired
      // image-layout event restores immediately after this render, before paint.
      this.dispatchEvent(new Event("image-will-layout", { bubbles: true, composed: true }));
    }
  }

  override updated(changed: PropertyValues): void {
    if (changed.has("source") || changed.has("phase")) {
      this.dispatchEvent(new Event("image-layout", { bubbles: true, composed: true }));
    }
  }

  private requestImage(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(new Event("image-request", { bubbles: true, composed: true }));
  }

  private retry(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.phase = "loading";
  }

  private open(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.source === undefined || this.phase !== "loaded") return;
    this.dispatchEvent(new CustomEvent<ImageOpenDetail>("image-open", {
      detail: { src: this.source, alt: this.description }, bubbles: true, composed: true,
    }));
  }

  override render() {
    const source = this.source;
    const pending = source === undefined;
    return html`
      <div class=${`frame ${pending ? "pending" : this.phase}`} aria-busy=${!pending && this.phase === "loading" ? "true" : "false"}>
        ${pending ? html`
          <button class="placeholder" type="button" @click=${(event: MouseEvent) => { this.requestImage(event); }}>
            <span>${t("image.show")}</span>${this.renderLabel()}
          </button>` : null}
        ${!pending && this.phase === "loading" ? html`
          <div class="placeholder" role="status"><span>${t("image.loading")}</span>${this.renderLabel()}</div>` : null}
        ${!pending && this.phase === "error" ? html`
          <div class="placeholder" role="status">
            <span>${t("image.unavailable")}</span>
            ${this.renderLabel()}<button type="button" @click=${(event: MouseEvent) => { this.retry(event); }}>${t("common.retry")}</button>
          </div>` : null}
        ${source !== undefined && this.phase !== "error" ? keyed(source, html`
          <button class="image-button" type="button" aria-label=${t("image.enlarge", { name: this.description || t("image.image") })} title=${t("image.clickToEnlarge")}
            ?disabled=${this.phase !== "loaded"} @click=${(event: MouseEvent) => { this.open(event); }}
            @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") this.open(event); }}>
            <img src=${source} alt=${this.description} decoding="async"
              @load=${(event: Event) => { if (event.currentTarget instanceof HTMLImageElement && event.currentTarget === this.renderRoot.querySelector("img")) this.phase = "loaded"; }}
              @error=${(event: Event) => { if (event.currentTarget instanceof HTMLImageElement && event.currentTarget === this.renderRoot.querySelector("img")) this.phase = "error"; }} />
          </button>`): null}
      </div>
    `;
  }

  private renderLabel() {
    return this.label === "" ? null : html`<code>${this.label}</code>`;
  }

  static override styles = css`
    :host { display: block; max-width: 100%; min-width: 0; }
    .frame { position: relative; max-width: 100%; }
    button { font: inherit; color: inherit; background: var(--pi-surface); border: 1px solid var(--pi-border, #888); border-radius: 4px; padding: .3em .65em; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
    .placeholder { box-sizing: border-box; display: grid; align-content: center; justify-items: center; gap: .5em; width: 320px; max-width: 100%; min-height: 110px; padding: 1em; border: 1px dashed var(--pi-border, #888); border-radius: 4px; background: var(--pi-surface); text-align: center; }
    code { display: block; max-width: 100%; margin: 0; overflow-wrap: anywhere; color: var(--pi-text-secondary); font-size: .85em; }
    [role="status"] { color: var(--pi-text-secondary); font-size: .9em; }
    .image-button { display: block; max-width: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
    img { display: block; max-width: 100%; max-height: var(--pi-image-max-height, none); width: auto; height: auto; object-fit: contain; border-radius: var(--pi-image-radius, 0); }
    /* Reserve a modest shell only until native dimensions are available. */
    .loading .image-button { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
  `;
}
