import type { ContentRendererInput, PiStudioPlugin } from "@pi-studio/pi-studio/plugin-api";
import { initMessages } from "./messages.js";
import { loadMermaidEngine, MermaidPreview } from "./MermaidPreview";

const plugin: PiStudioPlugin = {
  apiVersion: 4,
  name: "Mermaid",
  // Fail explicitly on older API v4 hosts that cannot consume renderers.
  // This plugin contributes to the capability but does not call its methods.
  requires: [{ pluginId: "pi-studio", id: "content-rendering", version: 1, parse: () => undefined }],
  activate: ({ html, i18n }) => {
    initMessages(i18n);
    // Portable machine copies share one tag but retain the active package's
    // source and asset loader, never the first machine's artifact URL.
    if (customElements.get("pi-studio-mermaid-preview") === undefined) customElements.define("pi-studio-mermaid-preview", MermaidPreview);
    return {
      contributions: {
        contentRenderers: [{
          id: "diagram",
          languages: ["mermaid"],
          fileExtensions: ["mmd", "mermaid"],
          render: (input: ContentRendererInput) => html`<pi-studio-mermaid-preview .input=${input} .loadEngine=${loadMermaidEngine}></pi-studio-mermaid-preview>`,
        }],
      },
    };
  },
};

export default plugin;
