import type { PiStudioPlugin } from "@pi-studio/pi-studio/plugin-api";
import { TASKS_CONFIG_PATH } from "./config.js";
import { initMessages, t } from "./messages.js";
import { defineTasksPanelElement, tasksPanelBadge } from "./tasksPanelElement.js";

const plugin = {
  apiVersion: 4,
  name: "Workspace Tasks",
  activate: ({ runtimePluginId, html, svg, i18n }) => {
    initMessages(i18n);
    defineTasksPanelElement();

    return {
      contributions: {
        actions: [
          {
            id: "workspace.open-tasks",
            title: t("action.open.title"),
            description: t("action.open.description", { path: TASKS_CONFIG_PATH }),
            group: "Workspace",
            enabled: (context) => context.state.selectedWorkspace !== undefined,
            run: (context) => {
              if (context.state.selectedWorkspace === undefined) return;
              context.selectWorkspaceTool(`${runtimePluginId}:workspace.tasks`);
            },
          },
        ],
        workspacePanels: [
          {
            id: "workspace.tasks",
            title: t("panel.title"),
            icon: svg`
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6h11"></path>
                <path d="M9 12h11"></path>
                <path d="M9 18h11"></path>
                <path d="m4 6 .8 .8L6.5 5"></path>
                <path d="m4 12 .8 .8 1.7-1.8"></path>
                <path d="m4 18 .8 .8 1.7-1.8"></path>
              </svg>
            `,
            order: 40,
            badge: (context) => tasksPanelBadge(context),
            render: (context) => html`<pi-studio-workspace-tasks-panel .context=${context}></pi-studio-workspace-tasks-panel>`,
          },
        ],
      },
    };
  },
} satisfies PiStudioPlugin;

export default plugin;
