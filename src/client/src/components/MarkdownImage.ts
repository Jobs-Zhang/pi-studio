import { LitElement, css, html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { TransientChoiceMemory } from "../formatting/transientChoiceMemory";
import { NearViewportImageController } from "./NearViewportImageController";
import "./ImagePresentation";

const shownImageMemory = new TransientChoiceMemory<true>();

/** An outside-workspace URL stays inert until the user chooses to load it. */
@customElement("pi-studio-markdown-image")
export class MarkdownImage extends LitElement {
  @property({ attribute: "preview-url" }) previewUrl = "";
  @property() path = "";
  @property() description = "";
  @property({ attribute: "intent-key" }) intentKey: string | undefined;
  @property({ type: Boolean }) outside = false;
  @state() private approved = false;
  private readonly viewport = new NearViewportImageController(this);

  override willUpdate(changed: PropertyValues): void {
    if (changed.has("previewUrl") || changed.has("intentKey") || changed.has("outside")) {
      this.approved = this.outside && this.intentKey !== undefined
        && shownImageMemory.read(this.intentKey, this.previewUrl) === true;
    }
    this.viewport.configure(this.previewUrl, !this.outside || this.approved);
  }

  private showImage(): void {
    this.approved = true;
    if (this.outside && this.intentKey !== undefined) shownImageMemory.choose(this.intentKey, this.previewUrl, true);
    this.viewport.configure(this.previewUrl, true);
    this.viewport.load();
  }

  override render() {
    return html`<pi-studio-image-presentation
      .source=${this.viewport.ready ? this.previewUrl : undefined}
      .description=${this.description} .label=${this.path}
      @image-request=${() => { this.showImage(); }}
    ></pi-studio-image-presentation>`;
  }

  static override styles = css`
    :host { display: inline-block; max-width: 100%; vertical-align: middle; }
  `;
}
