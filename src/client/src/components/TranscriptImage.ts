import { t } from "../i18n";
import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SessionRef } from "../../../shared/apiTypes";
import { isSessionMediaId } from "../../../shared/sessionMedia";
import { sessionMediaUrl } from "../api/urls";
import type { ChatImagePart } from "./shared";
import { NearViewportImageController } from "./NearViewportImageController";
import "./ImagePresentation";

export function transcriptImageSource(part: ChatImagePart, session?: SessionRef, machineId = "local"): { src: string; alt: string } | undefined {
  if (part.mediaId !== undefined) {
    if (session === undefined || !isSessionMediaId(part.mediaId)) return undefined;
    return { src: sessionMediaUrl(session, part.mediaId, machineId), alt: "attached image" };
  }
  return { src: `data:${part.mimeType};base64,${part.data}`, alt: "attached image" };
}

@customElement("pi-studio-transcript-image")
export class TranscriptImage extends LitElement {
  @property({ attribute: false }) imagePart: ChatImagePart | undefined;
  @property({ attribute: false }) session: SessionRef | undefined;
  @property() machineId = "local";
  private readonly viewport = new NearViewportImageController(this);
  private source: string | undefined;

  override willUpdate(): void {
    this.source = this.imagePart === undefined ? undefined : transcriptImageSource(this.imagePart, this.session, this.machineId)?.src;
    this.viewport.configure(this.source ?? "", true);
  }

  override render() {
    return html`<pi-studio-image-presentation
      .source=${this.viewport.ready ? this.source : undefined}
      description=${t("transcriptImage.attached")} label=${t("transcriptImage.attached")}
      @image-request=${() => { this.viewport.load(); }}
    ></pi-studio-image-presentation>`;
  }

  static override styles = css`:host { display: block; max-width: 100%; min-width: 0; }`;
}
