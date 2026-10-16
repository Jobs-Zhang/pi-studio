import type { PiStudioConfigResponse, PiStudioConfigValues } from "../../api";

export function pluginEnabledConfigPatch(baseConfig: PiStudioConfigValues, pluginId: string, enabled: boolean): PiStudioConfigValues {
  const currentPlugins = baseConfig.plugins ?? {};
  const currentPluginConfig = currentPlugins[pluginId] ?? {};
  return {
    plugins: {
      ...currentPlugins,
      [pluginId]: { ...currentPluginConfig, enabled },
    },
  };
}

export function mergeSelectedMachinePluginConfig(base: PiStudioConfigResponse, selectedMachine: PiStudioConfigResponse): PiStudioConfigResponse {
  return {
    ...base,
    config: mergePluginConfig(base.config, selectedMachine.config),
    effectiveConfig: mergePluginConfig(base.effectiveConfig, selectedMachine.effectiveConfig),
  };
}

function mergePluginConfig(base: PiStudioConfigValues, selectedMachine: PiStudioConfigValues): PiStudioConfigValues {
  if (selectedMachine.plugins === undefined) return base;
  return { ...base, plugins: selectedMachine.plugins };
}
