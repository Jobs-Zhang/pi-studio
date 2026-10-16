import type { PiStudioPlugin } from "@pi-studio/pi-studio/plugin-api";
import { RELAYS_ROOT } from "./relayDiscovery.js";
import { defineRelaysPanelElement } from "./relaysPanelElement.js";
import { initMessages, t } from "./messages.js";

const plugin = {
  apiVersion: 4,
  name: "Relays",
  activate: ({ runtimePluginId, html, svg, i18n }) => {
    initMessages(i18n);
    defineRelaysPanelElement();

    return {
      contributions: {
        actions: [
          {
            id: "workspace.open-relays",
            title: t("action.open.title"),
            description: t("action.open.description", { root: RELAYS_ROOT }),
            group: "Workspace",
            enabled: (context) => context.state.selectedWorkspace !== undefined,
            run: (context) => {
              if (context.state.selectedWorkspace === undefined) return;
              context.selectWorkspaceTool(`${runtimePluginId}:workspace.relays`);
            },
          },
        ],
        workspacePanels: [
          {
            id: "workspace.relays",
            title: t("panel.title"),
            icon: svg`
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 17H7A5 5 0 0 1 7 7h2"></path>
                <path d="M15 7h2a5 5 0 1 1 0 10h-2"></path>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
            `,
            order: 50,
            render: (context) => html`<pi-studio-relays-panel .context=${context}></pi-studio-relays-panel>`,
          },
        ],
      },
    };
  },
} satisfies PiStudioPlugin;

export default plugin;
