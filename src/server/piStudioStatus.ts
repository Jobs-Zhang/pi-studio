import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager, SettingsManager, VERSION as PI_CODING_AGENT_VERSION } from "@earendil-works/pi-coding-agent";
import type { ActiveAgentProfileDescriptor, PiStudioCapability, PiStudioComponentStatus, PiStudioDeprecatedAgentInput, PiStudioInstallationInfo, PiStudioReleaseStatus, PiStudioRuntimeComponent, PiStudioRuntimeResponse, PiStudioServiceComponent, PiStudioStatusMessage, PiStudioStatusResponse, PiStudioVersionResponse } from "../shared/apiTypes.js";
import { effectivePiStudioCapabilities, WEB_RUNTIME_CAPABILITIES } from "../shared/capabilities.js";
import { piStudioDockerCommand } from "../docker/piStudioDockerCommandPlan.js";
import { parsePiStudioRuntimeComponent } from "../shared/piStudioStatusParsing.js";
import { SessionDaemonClient } from "../sessiond/sessionDaemonClient.js";
import { isHostAbsoluteAgentDir, loadPiStudioConfig, PI_CODING_AGENT_DIR_ENV, type LoadedPiStudioConfig } from "../config.js";
import { createPiStudioReleaseLookupCache, type PiStudioReleaseLookup } from "./piStudioReleaseLookupCache.js";

const PI_STUDIO_PACKAGE_NAME = "@pi-studio/pi-studio";
const DEFAULT_VERSION = "0.0.0-dev";
const VERSION_CHECK_TIMEOUT_MS = 5000;

type ServiceId = "sessiond" | "web" | "uiDev";
type NativeServiceBackendKind = "systemd" | "launchd";

interface NativeServiceRef {
  id: ServiceId;
  systemdName: string;
  launchdLabel: string;
  launchdPlistName: string;
}

interface NativeServiceCommands {
  restart?: string;
  restartWeb?: string;
  restartSessiond?: string;
  status?: string;
}

const execFileAsync = promisify(execFile);

const serviceRefs: Record<ServiceId, NativeServiceRef> = {
  sessiond: {
    id: "sessiond",
    systemdName: "pi-studio-sessiond.service",
    launchdLabel: "com.pi-studio.sessiond",
    launchdPlistName: "com.pi-studio.sessiond.plist",
  },
  web: {
    id: "web",
    systemdName: "pi-studio.service",
    launchdLabel: "com.pi-studio.web",
    launchdPlistName: "com.pi-studio.web.plist",
  },
  uiDev: {
    id: "uiDev",
    systemdName: "pi-studio-ui-dev.service",
    launchdLabel: "com.pi-studio.ui-dev",
    launchdPlistName: "com.pi-studio.ui-dev.plist",
  },
};

const startServiceOrder: ServiceId[] = ["sessiond", "web", "uiDev"];
// Restart web/UI before sessiond: when the restart command runs in a pi-studio
// terminal (owned by sessiond), restarting sessiond kills the command, so any
// services listed after it would never be restarted.
const restartServiceOrder: ServiceId[] = ["web", "uiDev", "sessiond"];

interface PackageInfo {
  name: string;
  version: string;
  path: string;
}

interface PiStudioStatusDaemon {
  request(method: string, path: string, body?: unknown): Promise<{ statusCode: number; headers: Record<string, string>; body: string }>;
}

export interface PiStudioStatusOptions {
  forceReleaseCheck?: boolean;
  activeAgentProfile?: ActiveAgentProfileDescriptor;
  hasCommand?: (command: string) => Promise<boolean>;
}

const latestReleaseLookupCache = createPiStudioReleaseLookupCache(fetchLatestNpmVersion);
const runtimePackageInfo = readPackageInfoSync();

export function getPiStudioRuntimeComponent(component: PiStudioServiceComponent, capabilities: readonly PiStudioCapability[] = [], deprecatedAgentInputs: readonly PiStudioDeprecatedAgentInput[] = []): PiStudioRuntimeComponent {
  return {
    component,
    label: component === "web" ? "Web/UI" : "Session daemon",
    runtimeVersion: runtimePackageInfo?.version ?? DEFAULT_VERSION,
    piVersion: PI_CODING_AGENT_VERSION,
    available: true,
    capabilities: [...capabilities],
    ...(deprecatedAgentInputs.length === 0 ? {} : { deprecatedAgentInputs }),
  };
}

export interface PiStudioRuntimeOptions {
  /**
   * Config loader behind the web component's deprecated-input detection. The
   * loader reads this process's environment and the config file, so a config
   * edit clears the web-reported warning on the next runtime check.
   */
  loadConfig?: () => LoadedPiStudioConfig;
}

/**
 * The web component's runtime report with deprecated-input detection contained
 * at the component boundary: a malformed config file must not blank the whole
 * runtime report (the endpoint has no error handler, and federation peers
 * would mark the machine failed). Version and capabilities stay intact and
 * only the undetectable web-sourced deprecated inputs are omitted; the failure
 * travels through the component error channel, the same channel
 * `unavailableSessiondRuntime` uses for the daemon.
 */
function webRuntimeComponent(loadConfig: () => LoadedPiStudioConfig): PiStudioRuntimeComponent {
  try {
    return getPiStudioRuntimeComponent("web", WEB_RUNTIME_CAPABILITIES, loadConfig().deprecatedAgentInputs);
  } catch (error) {
    return {
      ...getPiStudioRuntimeComponent("web", WEB_RUNTIME_CAPABILITIES),
      error: `Could not check for deprecated agent configuration inputs: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function getPiStudioRuntime(daemon: PiStudioStatusDaemon = new SessionDaemonClient(), options: PiStudioRuntimeOptions = {}): Promise<PiStudioRuntimeResponse> {
  const web = webRuntimeComponent(options.loadConfig ?? loadPiStudioConfig);
  const sessiond = await getSessiondRuntimeComponent(daemon);
  return {
    packageName: PI_STUDIO_PACKAGE_NAME,
    generatedAt: new Date().toISOString(),
    components: { web, sessiond },
    capabilities: effectivePiStudioCapabilities({ web, sessiond }),
  };
}

export async function getPiStudioComponentStatus(component: PiStudioServiceComponent, options: PiStudioStatusOptions = {}): Promise<PiStudioComponentStatus> {
  const [installed, installation] = await Promise.all([
    readInstalledPackageInfo(),
    detectPiStudioInstallation(options.activeAgentProfile?.dir),
  ]);
  const runtimeVersion = runtimePackageInfo?.version ?? DEFAULT_VERSION;
  const installedVersion = installed?.version;
  return {
    component,
    label: component === "web" ? "Web/UI" : "Session daemon",
    runtimeVersion,
    ...(installedVersion === undefined ? {} : { installedVersion }),
    piVersion: PI_CODING_AGENT_VERSION,
    stale: isInstalledVersionNewer(installedVersion, runtimeVersion),
    available: true,
    installation,
  };
}

export async function getPiStudioVersionStatus(daemon: PiStudioStatusDaemon = new SessionDaemonClient(), options: PiStudioStatusOptions = {}): Promise<PiStudioVersionResponse> {
  const [web, sessiond] = await Promise.all([
    getPiStudioComponentStatus("web", options),
    getSessiondComponentStatus(daemon, options),
  ]);
  return {
    packageName: PI_STUDIO_PACKAGE_NAME,
    generatedAt: new Date().toISOString(),
    components: { web, sessiond },
  };
}

export async function getPiStudioStatus(daemon: PiStudioStatusDaemon = new SessionDaemonClient(), options: PiStudioStatusOptions = {}): Promise<PiStudioStatusResponse> {
  const versionStatus = await getPiStudioVersionStatus(daemon, options);
  const { web, sessiond } = versionStatus.components;
  const release = await getLatestReleaseStatus(web.installedVersion ?? web.runtimeVersion ?? DEFAULT_VERSION, options.forceReleaseCheck === true);
  const components = { web, sessiond };
  const commands = await commandsFor(components, {
    activeAgentProfile: options.activeAgentProfile,
    hasCommand: options.hasCommand ?? hasCommand,
  });
  const messages = buildMessages(components, release, commands);
  return {
    ...versionStatus,
    release,
    commands,
    messages,
  };
}

export function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined {
  const left = parsePackageVersion(leftVersion);
  const right = parsePackageVersion(rightVersion);
  if (left === undefined || right === undefined) return undefined;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === undefined) return 1;
  if (right.prerelease === undefined) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

function readPackageInfoSync(): PackageInfo | undefined {
  const path = packageJsonPath();
  try {
    return parsePackageInfo(JSON.parse(readFileSync(path, "utf8")), path);
  } catch {
    return undefined;
  }
}

async function readInstalledPackageInfo(): Promise<PackageInfo | undefined> {
  const path = packageJsonPath();
  try {
    await stat(path);
    return parsePackageInfo(JSON.parse(await readFile(path, "utf8")), path);
  } catch {
    return undefined;
  }
}

function packageJsonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
}

function parsePackageInfo(value: unknown, path: string): PackageInfo | undefined {
  if (!isRecord(value)) return undefined;
  const name = value["name"];
  const version = value["version"];
  if (typeof name !== "string" || name === "" || typeof version !== "string" || version === "") return undefined;
  return { name, version, path };
}

export async function detectPiStudioInstallation(agentDir?: string): Promise<PiStudioInstallationInfo> {
  const docker = detectDockerInstallation();
  if (docker !== undefined) return docker;
  const root = packageRootPath();
  const realRoot = await realPathOrSelf(root);
  if (agentDir !== undefined) {
    const piPackage = await detectPiPackageInstallation(realRoot, root, agentDir);
    if (piPackage !== undefined) return piPackage;
  }
  const npmGlobal = await detectNpmGlobalInstallation(realRoot, root);
  if (npmGlobal !== undefined) return npmGlobal;
  return { kind: "local", path: root };
}

function detectDockerInstallation(): PiStudioInstallationInfo | undefined {
  if (!isTruthyEnv("PI_STUDIO_DOCKER_RUNTIME")) return undefined;
  const dockerMode = dockerModeFromEnv(process.env["PI_STUDIO_DOCKER_MODE"]) ?? inferredDockerModeFromRoots();
  const path = dockerRootPathFromEnv(dockerMode);
  return {
    kind: "docker",
    ...(path === undefined ? {} : { path }),
    ...(dockerMode === undefined ? {} : { dockerMode }),
  };
}

function dockerModeFromEnv(value: string | undefined): PiStudioInstallationInfo["dockerMode"] | undefined {
  return value === "runtime" || value === "dev" ? value : undefined;
}

function inferredDockerModeFromRoots(): PiStudioInstallationInfo["dockerMode"] | undefined {
  if (firstNonEmptyEnv("PI_STUDIO_DOCKER_DEV_REPO_ROOT") !== undefined) return "dev";
  if (firstNonEmptyEnv("PI_STUDIO_DOCKER_INSTALL_DIR") !== undefined) return "runtime";
  return undefined;
}

function dockerRootPathFromEnv(mode: PiStudioInstallationInfo["dockerMode"] | undefined): string | undefined {
  if (mode === "dev") return firstNonEmptyEnv("PI_STUDIO_DOCKER_DEV_REPO_ROOT", "PI_STUDIO_DOCKER_INSTALL_DIR");
  if (mode === "runtime") return firstNonEmptyEnv("PI_STUDIO_DOCKER_INSTALL_DIR", "PI_STUDIO_DOCKER_DEV_REPO_ROOT");
  return firstNonEmptyEnv("PI_STUDIO_DOCKER_INSTALL_DIR", "PI_STUDIO_DOCKER_DEV_REPO_ROOT");
}

function firstNonEmptyEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function isTruthyEnv(key: string): boolean {
  const value = process.env[key];
  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

async function detectPiPackageInstallation(realRoot: string, displayPath: string, agentDir: string): Promise<PiStudioInstallationInfo | undefined> {
  try {
    const packageManager = new DefaultPackageManager({
      cwd: process.cwd(),
      agentDir,
      settingsManager: SettingsManager.create(process.cwd(), agentDir),
    });
    for (const configuredPackage of packageManager.listConfiguredPackages()) {
      const installedPath = configuredPackage.installedPath ?? packageManager.getInstalledPath(configuredPackage.source, configuredPackage.scope);
      if (installedPath === undefined) continue;
      const realInstalledPath = await realPathOrSelf(installedPath);
      // PI STUDIO is a Pi package only when its own root is the installed package or
      // sits inside it. The reverse never holds: a package vendored *inside* the
      // checkout (PI STUDIO ships one at dist/pi-packages/relays) is a payload PI STUDIO
      // carries, not the installation PI STUDIO was delivered by.
      if (isSameOrWithin(realInstalledPath, realRoot)) {
        return { kind: "pi-package", path: displayPath, source: configuredPackage.source, scope: configuredPackage.scope };
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function detectNpmGlobalInstallation(realRoot: string, displayPath: string): Promise<PiStudioInstallationInfo | undefined> {
  const npmRoot = await npmGlobalRoot();
  if (npmRoot === undefined) return undefined;
  const realNpmRoot = await realPathOrSelf(npmRoot);
  if (!isSameOrWithin(realNpmRoot, realRoot)) return undefined;
  return { kind: "npm-global", path: displayPath, npmRoot };
}

async function npmGlobalRoot(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("npm", ["root", "-g"], { encoding: "utf8" });
    const root = stdout.trim();
    return root === "" ? undefined : root;
  } catch {
    return undefined;
  }
}

function packageRootPath(): string {
  return dirname(packageJsonPath());
}

async function realPathOrSelf(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path));
}

function isSameOrWithin(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

async function getSessiondRuntimeComponent(daemon: PiStudioStatusDaemon): Promise<PiStudioRuntimeComponent> {
  try {
    const upstream = await daemon.request("GET", "/runtime");
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return unavailableSessiondRuntime(`runtime check returned HTTP ${String(upstream.statusCode)}`);
    }
    const parsed: unknown = upstream.body === "" ? undefined : JSON.parse(upstream.body);
    const runtime = parsePiStudioRuntimeComponent(parsed);
    if (runtime !== undefined) return runtime;
    return unavailableSessiondRuntime("runtime response did not include valid runtime information");
  } catch (error) {
    return unavailableSessiondRuntime(error instanceof Error ? error.message : String(error));
  }
}

async function getSessiondComponentStatus(daemon: PiStudioStatusDaemon, options: PiStudioStatusOptions = {}): Promise<PiStudioComponentStatus> {
  try {
    const upstream = await daemon.request("GET", "/runtime");
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return unavailableSessiond(`runtime check returned HTTP ${String(upstream.statusCode)}`);
    }
    const parsed: unknown = upstream.body === "" ? undefined : JSON.parse(upstream.body);
    const runtime = parsePiStudioRuntimeComponent(parsed);
    if (runtime?.available !== true) return unavailableSessiond(runtime?.error ?? "runtime response did not include valid runtime information");
    const status = await getPiStudioComponentStatus("sessiond", options);
    const runtimeVersion = runtime.runtimeVersion ?? status.runtimeVersion;
    return {
      ...status,
      ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
      // The daemon reports the Pi version it has loaded in its own process;
      // the spread of `status` already carries this process's Pi version as
      // the fallback for daemons that predate Pi version reporting, mirroring
      // the runtimeVersion fallback.
      ...(runtime.piVersion === undefined ? {} : { piVersion: runtime.piVersion }),
      stale: isInstalledVersionNewer(status.installedVersion, runtimeVersion),
      available: true,
    };
  } catch (error) {
    return unavailableSessiond(error instanceof Error ? error.message : String(error));
  }
}

function unavailableSessiondRuntime(error: string): PiStudioRuntimeComponent {
  return {
    component: "sessiond",
    label: "Session daemon",
    available: false,
    capabilities: [],
    error,
  };
}

function unavailableSessiond(error: string): PiStudioComponentStatus {
  return {
    component: "sessiond",
    label: "Session daemon",
    stale: false,
    available: false,
    error,
  };
}

async function getLatestReleaseStatus(currentVersion: string, force: boolean): Promise<PiStudioReleaseStatus> {
  const checkedAtMs = Date.now();
  if (skipVersionCheck()) {
    return { packageName: PI_STUDIO_PACKAGE_NAME, updateAvailable: false, checkedAt: new Date(checkedAtMs).toISOString(), skipped: true };
  }

  return releaseStatusFromCache(await latestReleaseLookupCache.get(currentVersion, { force }), currentVersion);
}

function releaseStatusFromCache(cache: PiStudioReleaseLookup, currentVersion: string): PiStudioReleaseStatus {
  return {
    packageName: PI_STUDIO_PACKAGE_NAME,
    ...(cache.latestVersion === undefined ? {} : { latestVersion: cache.latestVersion }),
    updateAvailable: cache.latestVersion === undefined ? false : isNewerPackageVersion(cache.latestVersion, currentVersion),
    checkedAt: new Date(cache.checkedAtMs).toISOString(),
    ...(cache.error === undefined ? {} : { error: cache.error }),
  };
}

async function fetchLatestNpmVersion(currentVersion: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(PI_STUDIO_PACKAGE_NAME)}/latest`, {
    headers: {
      accept: "application/json",
      "user-agent": `${PI_STUDIO_PACKAGE_NAME}/${currentVersion}`,
    },
    signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${String(response.status)}`);
  const data: unknown = await response.json();
  const version = isRecord(data) ? data["version"] : undefined;
  if (typeof version !== "string" || version === "") throw new Error("npm registry response did not include a version");
  return version;
}

async function commandsFor(components: PiStudioStatusResponse["components"], options: {
  activeAgentProfile: ActiveAgentProfileDescriptor | undefined;
  hasCommand: (command: string) => Promise<boolean>;
}): Promise<PiStudioStatusResponse["commands"]> {
  const installation = preferredInstallation(components);
  if (installation?.kind === "docker") return dockerCommands(installation);

  const [serviceCommands, cliCommands] = await Promise.all([
    nativeServiceCommands(),
    piStudioCliCommands(installation),
  ]);
  const restart = restartCommandFor(installation, serviceCommands, cliCommands);
  const restartWeb = serviceCommands.restartWeb ?? cliCommands.restart;
  const restartSessiond = serviceCommands.restartSessiond ?? cliCommands.restart;
  const status = serviceCommands.status ?? cliCommands.status;
  const update = updateCommandFor(installation, options);

  return {
    ...(update === undefined ? {} : { update }),
    ...(restart === undefined ? {} : { restart }),
    ...(restartWeb === undefined ? {} : { restartWeb }),
    ...(restartSessiond === undefined ? {} : { restartSessiond }),
    ...(status === undefined ? {} : { status }),
  };
}

function preferredInstallation(components: PiStudioStatusResponse["components"]): PiStudioInstallationInfo | undefined {
  const web = components.web.installation;
  const sessiond = components.sessiond.installation;
  if (web?.kind === "docker" || sessiond?.kind === "docker") return web?.kind === "docker" ? web : sessiond;
  if (web?.kind === "local" || sessiond?.kind === "local") return web?.kind === "local" ? web : sessiond;
  return web ?? sessiond;
}

function dockerCommands(installation: PiStudioInstallationInfo): PiStudioStatusResponse["commands"] {
  return {
    update: `${shellQuote(process.execPath)} ${shellQuote(join(packageRootPath(), "dist", "cli.js"))} update`,
    restart: piStudioDockerCommand(installation.dockerMode, "restart"),
    restartWeb: piStudioDockerCommand(installation.dockerMode, "restart-web"),
    restartSessiond: piStudioDockerCommand(installation.dockerMode, "restart-sessiond"),
    status: piStudioDockerCommand(installation.dockerMode, "status"),
  };
}

async function piStudioCliCommands(installation: PiStudioInstallationInfo | undefined): Promise<NativeServiceCommands> {
  if (installation?.kind !== "npm-global" || !(await hasCommand("pi-studio"))) return {};
  return { restart: "pi-studio restart", status: "pi-studio status" };
}

function restartCommandFor(installation: PiStudioInstallationInfo | undefined, serviceCommands: NativeServiceCommands, cliCommands: NativeServiceCommands): string | undefined {
  if (installation?.kind === "local" || installation?.kind === "pi-package") return serviceCommands.restart ?? cliCommands.restart;
  return cliCommands.restart ?? serviceCommands.restart;
}

export function updateCommandFor(installation: PiStudioInstallationInfo | undefined, options: {
  activeAgentProfile: ActiveAgentProfileDescriptor | undefined;
  hasCommand: (command: string) => Promise<boolean>;
}): string | undefined {
  const profile = options.activeAgentProfile;
  if (profile !== undefined && !isHostAbsoluteAgentDir(profile.dir)) return undefined;
  if (installation?.kind === "pi-package" && profile === undefined) return undefined;

  let cli: string;
  if (installation?.kind === "pi-package" || installation?.kind === "local" || installation?.kind === "npm-global") {
    if (installation.path === undefined || !isAbsolute(installation.path)) return undefined;
    // These installations need not expose pi-studio on PATH. Invoke this exact
    // installation, leaving update policy and safe restart planning to the CLI.
    cli = `${shellQuote(process.execPath)} ${shellQuote(join(installation.path, "dist", "cli.js"))}`;
  } else {
    return undefined;
  }
  const profileEnv = profile === undefined ? "" : `${PI_CODING_AGENT_DIR_ENV}=${shellQuote(profile.dir)} `;
  return `${profileEnv}${cli} update`;
}

async function nativeServiceCommands(): Promise<NativeServiceCommands> {
  const backend = await nativeServiceBackend();
  if (backend === undefined) return {};
  const installed = installedServiceIds(backend);
  if (installed.size === 0) return {};
  const web = installedServiceRefs(installed, ["web", "uiDev"]);
  const sessiond = installedServiceRefs(installed, ["sessiond"]);
  const restartable = web.length === 0 ? [] : installedServiceRefs(installed, restartServiceOrder, restartServiceOrder);
  const status = installedServiceRefs(installed);
  return {
    ...(restartable.length === 0 ? {} : { restart: restartNativeServicesCommand(backend, restartable, "pi-studio-restart") }),
    ...(web.length === 0 ? {} : { restartWeb: restartNativeServicesCommand(backend, web, "pi-studio-restart-web") }),
    ...(sessiond.length === 0 ? {} : { restartSessiond: restartNativeServicesCommand(backend, sessiond, "pi-studio-restart-sessiond") }),
    ...(status.length === 0 ? {} : { status: statusNativeServicesCommand(backend, status) }),
  };
}

async function nativeServiceBackend(): Promise<NativeServiceBackendKind | undefined> {
  if (process.platform === "linux" && await hasCommand("systemctl")) return "systemd";
  if (process.platform === "darwin" && await hasCommand("launchctl")) return "launchd";
  return undefined;
}

function installedServiceIds(backend: NativeServiceBackendKind): Set<ServiceId> {
  return new Set(startServiceOrder.filter((id) => existsSync(serviceFilePath(backend, serviceRefs[id]))));
}

function installedServiceRefs(installed: Set<ServiceId>, candidates: ServiceId[] = startServiceOrder, order: ServiceId[] = startServiceOrder): NativeServiceRef[] {
  return order.filter((id) => candidates.includes(id) && installed.has(id)).map((id) => serviceRefs[id]);
}

function serviceFilePath(backend: NativeServiceBackendKind, ref: NativeServiceRef): string {
  return backend === "systemd" ? join(systemdServiceDir(), ref.systemdName) : join(launchdServiceDir(), ref.launchdPlistName);
}

function systemdServiceDir(): string {
  return join(homedir(), ".config", "systemd", "user");
}

function launchdServiceDir(): string {
  return join(homedir(), "Library", "LaunchAgents");
}

function restartNativeServicesCommand(backend: NativeServiceBackendKind, refs: NativeServiceRef[], systemdUnit: string): string {
  // On systemd, run the restart inside a transient, detached `.service` unit
  // (the default `systemd-run` mode, not `--scope`). A scope would stay a child
  // of the calling shell and die with the terminal; a transient service is
  // reparented to the user service manager, so the restart finishes even when
  // restarting the session daemon kills the pi-studio terminal that launched it.
  // `--collect` cleans the unit up afterwards, and the fixed `--unit` name makes
  // logs easy to find with `journalctl --user -u <unit>`.
  if (backend === "systemd") {
    const names = refs.map((ref) => ref.systemdName).join(" ");
    return `systemd-run --user --collect --unit=${systemdUnit} -- systemctl --user restart ${names}`;
  }
  return refs.map((ref) => `launchctl kickstart -k gui/$(id -u)/${ref.launchdLabel}`).join(" && ");
}

function statusNativeServicesCommand(backend: NativeServiceBackendKind, refs: NativeServiceRef[]): string {
  if (backend === "systemd") return `systemctl --user status ${refs.map((ref) => ref.systemdName).join(" ")}`;
  return refs.map((ref) => `launchctl print gui/$(id -u)/${ref.launchdLabel}`).join(" && ");
}

function hasCommand(command: string): Promise<boolean> {
  return commandSucceeds("/usr/bin/env", ["sh", "-c", `command -v ${shellQuote(command)}`]);
}

async function commandSucceeds(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildMessages(components: PiStudioStatusResponse["components"], release: PiStudioReleaseStatus, commands: PiStudioStatusResponse["commands"]): PiStudioStatusMessage[] {
  const messages: PiStudioStatusMessage[] = [];
  const installedVersion = components.web.installedVersion ?? components.web.runtimeVersion;

  if (release.updateAvailable && release.latestVersion !== undefined) {
    messages.push({
      id: "update-available",
      severity: "info",
      title: "PI STUDIO update available",
      body: commands.update === undefined
        ? `PI STUDIO ${release.latestVersion} is available${installedVersion === undefined ? "" : `; installed version is ${installedVersion}`}. Update PI STUDIO, then restart the services or processes for this installation.`
        : `PI STUDIO ${release.latestVersion} is available${installedVersion === undefined ? "" : `; installed version is ${installedVersion}`}. Run the update command to review the installation-specific plan and confirm. Updates may interrupt active sessions; if this terminal cannot safely run the update, the CLI will provide instructions.`,
      ...optionalMessageCommand(commands.update),
    });
  }

  if (components.web.stale) {
    const command = commands.restartWeb ?? commands.restart;
    messages.push({
      id: "web-stale",
      severity: "warning",
      title: "Web/UI service restart needed",
      body: command === undefined
        ? `The Web/UI service is running ${formatVersion(components.web.runtimeVersion)}, but ${formatVersion(components.web.installedVersion)} is installed. Restart the Web/UI service or process to use the installed version.`
        : `The Web/UI service is running ${formatVersion(components.web.runtimeVersion)}, but ${formatVersion(components.web.installedVersion)} is installed. Restart the service to use the installed version.`,
      ...optionalMessageCommand(command),
    });
  }

  if (!components.sessiond.available) {
    messages.push({
      id: "sessiond-unavailable",
      severity: "warning",
      title: "Session daemon version unavailable",
      body: commands.status === undefined
        ? `PI STUDIO could not check the session daemon version${components.sessiond.error === undefined ? "." : `: ${components.sessiond.error}`}. Check the session daemon service or process that runs this installation.`
        : `PI STUDIO could not check the session daemon version${components.sessiond.error === undefined ? "." : `: ${components.sessiond.error}`}`,
      ...optionalMessageCommand(commands.status),
    });
  } else if (components.sessiond.stale) {
    const command = commands.restartSessiond ?? commands.restart;
    messages.push({
      id: "sessiond-stale",
      severity: "warning",
      title: "Session daemon restart needed",
      body: command === undefined
        ? `The session daemon is running ${formatVersion(components.sessiond.runtimeVersion)}, but ${formatVersion(components.sessiond.installedVersion)} is installed. Restart the session daemon service or process to use the installed version.`
        : `The session daemon is running ${formatVersion(components.sessiond.runtimeVersion)}, but ${formatVersion(components.sessiond.installedVersion)} is installed. Restart the daemon to use the installed version.`,
      ...optionalMessageCommand(command),
    });
  }

  return messages;
}

function optionalMessageCommand(command: string | undefined): Pick<PiStudioStatusMessage, "command"> | object {
  return command === undefined ? {} : { command };
}

function skipVersionCheck(): boolean {
  return ["PI_STUDIO_SKIP_VERSION_CHECK", "PI_STUDIO_OFFLINE", "PI_SKIP_VERSION_CHECK", "PI_OFFLINE"].some((key) => {
    const value = process.env[key];
    return value !== undefined && value !== "";
  });
}

function isInstalledVersionNewer(installedVersion: string | undefined, runtimeVersion: string | undefined): boolean {
  if (installedVersion === undefined || runtimeVersion === undefined) return false;
  return isNewerPackageVersion(installedVersion, runtimeVersion);
}

function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean {
  const comparison = comparePackageVersions(candidateVersion, currentVersion);
  if (comparison !== undefined) return comparison > 0;
  return candidateVersion.trim() !== currentVersion.trim();
}

function parsePackageVersion(version: string): { major: number; minor: number; patch: number; prerelease?: string } | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/u.exec(version.trim());
  if (match === null) return undefined;
  const [, major, minor, patch, prerelease] = match;
  if (major === undefined || minor === undefined || patch === undefined) return undefined;
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
    ...(prerelease === undefined ? {} : { prerelease }),
  };
}

function formatVersion(version: string | undefined): string {
  return version ?? "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
