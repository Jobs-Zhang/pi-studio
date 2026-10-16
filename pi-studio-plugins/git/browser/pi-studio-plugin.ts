import type { PiStudioPlugin } from "@pi-studio/pi-studio/plugin-api";
import { createGitBrowserContributions } from "./git-panel.js";
import { initMessages } from "./messages.js";

const plugin = {
  apiVersion: 4,
  name: "Git",
  activate: ({ pluginId, runtimePluginId, html, svg, i18n }) => {
    initMessages(i18n);
    return {
      contributions: createGitBrowserContributions(pluginId, runtimePluginId, html, svg),
    };
  },
} satisfies PiStudioPlugin;

export default plugin;
