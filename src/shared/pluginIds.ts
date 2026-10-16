export const piStudioPluginIdPattern = /^[a-z][a-z0-9.-]*$/u;

const reservedPiStudioPluginIds = new Set(["core", "themes"]);
const machinePluginIdPrefix = "machine.";
const bundledPiStudioPluginId = "pi-studio";
const bundledPiStudioPluginIdPrefix = `${bundledPiStudioPluginId}.`;

export function isPiStudioPluginId(value: string): boolean {
  return piStudioPluginIdPattern.test(value);
}

export function isPiStudioBundledPluginId(value: string): boolean {
  return value === bundledPiStudioPluginId || value.startsWith(bundledPiStudioPluginIdPrefix);
}

export function isReservedPiStudioPluginId(value: string): boolean {
  return reservedPiStudioPluginIds.has(value)
    || value.startsWith(machinePluginIdPrefix)
    || isPiStudioBundledPluginId(value);
}
