import type { PiStudioDockerMode, PiStudioInstallationInfo, PiStudioStatusMessage, PiStudioStatusResponse, PluginRuntimeState } from "@pi-studio/pi-studio/plugin-api";
import { t } from "./messages.js";

export interface CommandEntry {
  label: string;
  command: string;
}

export interface UpdatesRuntimeHint {
  dockerMode?: PiStudioDockerMode;
}

// The shared update CLI owns installation-specific planning, confirmation, and
// safe execution. Stale components without an available update need a restart.
export function recommendedCommand(status: PiStudioStatusResponse): CommandEntry | undefined {
  const { commands, release, components } = status;
  if (release.updateAvailable && typeof commands.update === "string" && commands.update !== "") {
    return { label: t("command.update"), command: commands.update };
  }
  const restartNeeded = components.web.stale || components.sessiond.stale || !components.sessiond.available;
  if (restartNeeded && typeof commands.restart === "string" && commands.restart !== "") {
    return { label: t("command.restartEverything"), command: commands.restart };
  }
  return undefined;
}

export function additionalCommands(status: PiStudioStatusResponse, recommended: CommandEntry | undefined): CommandEntry[] {
  return [
    [t("command.updateShort"), status.commands.update],
    [t("command.restartAll"), status.commands.restart],
    [t("command.restartWeb"), status.commands.restartWeb],
    [t("command.restartSessiond"), status.commands.restartSessiond],
    [t("command.status"), status.commands.status],
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
    .filter(([, command]) => command !== recommended?.command)
    .map(([label, command]) => ({ label, command }));
}

export function messagesFor(state: PluginRuntimeState | undefined): PiStudioStatusMessage[] {
  return state?.piStudioStatus?.messages ?? [];
}

export function statusFor(state: PluginRuntimeState | undefined): PiStudioStatusResponse | undefined {
  return state?.piStudioStatus;
}

export function messageCount(state: PluginRuntimeState | undefined): number {
  return messagesFor(state).length;
}

export function isSelfManagedInstallation(installation: PiStudioInstallationInfo | undefined): boolean {
  return installation === undefined || installation.kind === "local" || installation.kind === "docker" || installation.kind === "unknown";
}

export function shouldShowUpdatesPanel(state: PluginRuntimeState | undefined, hint: UpdatesRuntimeHint = {}): boolean {
  const status = statusFor(state);
  if (hint.dockerMode !== undefined) return true;
  if (messageCount(state) > 0) return true;
  if (status === undefined) return false;
  return isSelfManagedInstallation(status.components.web.installation)
    || isSelfManagedInstallation(status.components.sessiond.installation);
}

export function fallbackDockerStatus(hint: UpdatesRuntimeHint, generatedAt = t("fallback.generatedAt")): PiStudioStatusResponse | undefined {
  if (hint.dockerMode === undefined) return undefined;
  const commandPrefix = hint.dockerMode === "dev" ? "pi-studio-docker --dev" : "pi-studio-docker";
  const installation: PiStudioInstallationInfo = { kind: "docker", dockerMode: hint.dockerMode };
  return {
    packageName: "@pi-studio/pi-studio",
    generatedAt,
    components: {
      web: { component: "web", label: t("fallback.webLabel"), stale: false, available: true, installation },
      sessiond: { component: "sessiond", label: t("fallback.sessiondLabel"), stale: false, available: true, installation },
    },
    release: { packageName: "@pi-studio/pi-studio", updateAvailable: false, skipped: true },
    commands: {
      // The development image mounts its built checkout at /workspace and does
      // not install a global pi-studio executable. Both invoke the same CLI.
      update: hint.dockerMode === "dev" ? "node /workspace/dist/cli.js update" : "pi-studio update",
      restart: `${commandPrefix} restart`,
      restartWeb: `${commandPrefix} restart-web`,
      restartSessiond: `${commandPrefix} restart-sessiond`,
      status: `${commandPrefix} status`,
    },
    messages: [{
      id: "docker-status-compatibility",
      severity: "info",
      title: t("fallback.dockerMessageTitle"),
      body: t("fallback.dockerMessageBody"),
    }],
  };
}

export function formatVersion(version: string | undefined): string {
  return version === undefined || version === "" ? t("version.unknown") : version;
}

export function installationLabel(installation: PiStudioInstallationInfo | undefined): string {
  if (installation === undefined) return t("installation.unknown");
  if (installation.kind === "pi-package") {
    const scope = installation.scope === undefined ? "" : ` · ${installation.scope}`;
    const source = installation.source ?? t("installation.piPackage");
    return `${source}${scope}`;
  }
  if (installation.kind === "npm-global") return t("installation.npmGlobal");
  if (installation.kind === "local") return t("installation.local");
  if (installation.kind === "docker") return installation.dockerMode === "dev" ? t("installation.dockerDev") : t("installation.docker");
  return t("installation.unknown");
}
