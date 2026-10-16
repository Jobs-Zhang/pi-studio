// Skeleton of a PI STUDIO plugin: metadata plus contribution definitions.
//
// Everything the bundled Info panel and action actually render lives in
// infoInternals.ts. That file is replaceable implementation detail — when
// copying this plugin as a starting point, keep this file's shape and swap
// the internals for your own.

import type { PiStudioPlugin } from "@pi-studio/pi-studio/plugin-api";
import { copyDiagnostics, renderInfoPanel } from "./infoInternals.js";
import { initMessages, t } from "./messages.js";

const plugin = {
  apiVersion: 4,
  name: "Info Plugin",
  activate: ({ html, svg, i18n }) => {
    initMessages(i18n);
    return {
      contributions: {
      actions: [
        {
          id: "copy-diagnostics",
          title: t("action.copy.title"),
          description: t("action.copy.description"),
          group: "Info",
          run: (context) => copyDiagnostics(context),
        },
      ],
      workspaceLabels: [
        {
          id: "workspace.kind-label",
          order: 100,
          items: (context) => [{ type: "text", text: context.workspace.provider?.pluginId ?? "folder", title: context.workspace.path }],
        },
      ],
      applicationPanels: [
        {
          id: "workspace.info",
          title: t("panel.title"),
          icon: svg`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M12 11v5"></path>
              <path d="M12 8h.01"></path>
            </svg>
          `,
          order: 1000,
          render: (context) => renderInfoPanel(html, context),
        },
      ],
    },
    };
  },
} satisfies PiStudioPlugin;

export default plugin;
