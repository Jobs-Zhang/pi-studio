import type { PiStudioPluginRecoveryCommands } from "./apiTypes.js";
import { isPiStudioPluginId } from "./pluginIds.js";

/** Secret-free commands accepted by the offline recovery CLI. */
export const PI_STUDIO_PLUGIN_RECOVERY_COMMANDS: Readonly<PiStudioPluginRecoveryCommands> = Object.freeze({
  showSafeStart: "pi-studio plugins safe-start show",
  bundledOnly: "pi-studio plugins safe-start set bundled-only --restart",
  noServerPlugins: "pi-studio plugins safe-start set none --restart",
  clearSafeStart: "pi-studio plugins safe-start clear --restart",
});

export function pluginDisableRecoveryCommand(pluginId: string): string {
  if (!isPiStudioPluginId(pluginId)) throw new Error(`Invalid PI STUDIO plugin id: ${pluginId}`);
  return `pi-studio plugins disable ${pluginId} --restart`;
}
