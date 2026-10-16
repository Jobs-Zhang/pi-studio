import { PI_STUDIO_CAPABILITIES, type PiStudioCapability, type PiStudioRuntimeComponent, type PiStudioServiceComponent } from "./apiTypes.js";

export { PI_STUDIO_CAPABILITIES };
export type { PiStudioCapability };

// Annotated (not inferred) so the empty and populated registry shapes are
// identical for consumers: `Object.values` on the empty registry alone would
// not infer `PiStudioCapability[]`.
export const KNOWN_PI_STUDIO_CAPABILITIES: PiStudioCapability[] = Object.values(PI_STUDIO_CAPABILITIES);
const knownPiStudioCapabilities: ReadonlySet<string> = new Set(KNOWN_PI_STUDIO_CAPABILITIES);

export const WEB_RUNTIME_CAPABILITIES = [
  PI_STUDIO_CAPABILITIES.pluginLifecycle,
] as const satisfies readonly PiStudioCapability[];

export const SESSIOND_RUNTIME_CAPABILITIES = [] as const satisfies readonly PiStudioCapability[];

// Populated entries map each capability to the components that must both
// advertise it.
const EFFECTIVE_CAPABILITY_REQUIREMENTS = {
  [PI_STUDIO_CAPABILITIES.pluginLifecycle]: ["web"],
} as const satisfies Record<PiStudioCapability, readonly PiStudioServiceComponent[]>;

export function isPiStudioCapability(value: unknown): value is PiStudioCapability {
  return typeof value === "string" && knownPiStudioCapabilities.has(value);
}

export function supportsPiStudioCapability(source: { capabilities?: readonly PiStudioCapability[] } | undefined, capability: PiStudioCapability): boolean {
  return source?.capabilities?.includes(capability) === true;
}

export function parseKnownPiStudioCapabilities(value: unknown): PiStudioCapability[] | undefined {
  if (!Array.isArray(value) || !value.every((capability) => typeof capability === "string")) return undefined;
  return value.filter(isPiStudioCapability);
}

export function effectivePiStudioCapabilities(components: Partial<Record<PiStudioServiceComponent, Pick<PiStudioRuntimeComponent, "available" | "capabilities">>>): PiStudioCapability[] {
  return KNOWN_PI_STUDIO_CAPABILITIES.filter((capability) => {
    const requiredComponents: readonly PiStudioServiceComponent[] = EFFECTIVE_CAPABILITY_REQUIREMENTS[capability];
    return requiredComponents.every((component) => {
      const runtime = components[component];
      return runtime?.available === true && supportsPiStudioCapability(runtime, capability);
    });
  });
}
