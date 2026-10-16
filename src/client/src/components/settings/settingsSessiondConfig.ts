import type { PiStudioConfigResponse, PiStudioConfigValues } from "../../api";

export function spawnSessionsConfigPatch(enabled: boolean): PiStudioConfigValues {
  return { spawnSessions: enabled };
}

export function subsessionsConfigPatch(enabled: boolean): PiStudioConfigValues {
  return { subsessions: enabled };
}

export function askUserConfigPatch(enabled: boolean): PiStudioConfigValues {
  return { askUser: enabled };
}

export function mergeSelectedMachineSessiondConfig(base: PiStudioConfigResponse, selectedMachine: PiStudioConfigResponse): PiStudioConfigResponse {
  return {
    ...base,
    config: { ...base.config, ...selectedMachine.config },
    effectiveConfig: { ...base.effectiveConfig, ...selectedMachine.effectiveConfig },
    envOverrides: {
      ...base.envOverrides,
      spawnSessions: selectedMachine.envOverrides.spawnSessions,
      subsessions: selectedMachine.envOverrides.subsessions,
      askUser: selectedMachine.envOverrides.askUser,
    },
  };
}
