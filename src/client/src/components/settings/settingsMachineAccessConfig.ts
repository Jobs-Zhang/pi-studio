import type { PiStudioConfigResponse, PiStudioConfigValues } from "../../api";

export function mergeSelectedMachineAccessConfig(base: PiStudioConfigResponse, selectedMachine: PiStudioConfigResponse): PiStudioConfigResponse {
  return {
    ...base,
    config: mergeAccessConfig(base.config, selectedMachine.config),
    effectiveConfig: mergeAccessConfig(base.effectiveConfig, selectedMachine.effectiveConfig),
  };
}

function mergeAccessConfig(base: PiStudioConfigValues, selectedMachine: PiStudioConfigValues): PiStudioConfigValues {
  return {
    ...base,
    ...(selectedMachine.pathAccess === undefined ? {} : { pathAccess: selectedMachine.pathAccess }),
    ...(selectedMachine.uploads === undefined ? {} : { uploads: selectedMachine.uploads }),
    ...(selectedMachine.attachments === undefined ? {} : { attachments: selectedMachine.attachments }),
    ...(selectedMachine.maxUploadBytes === undefined ? {} : { maxUploadBytes: selectedMachine.maxUploadBytes }),
  };
}
