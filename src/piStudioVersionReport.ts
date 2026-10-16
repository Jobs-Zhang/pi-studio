import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { effectivePiStudioConfig } from "./config.js";
import { SessionDaemonClient } from "./sessiond/sessionDaemonClient.js";
import type { PiStudioComponentStatus, PiStudioInstallationInfo, PiStudioVersionResponse } from "./shared/apiTypes.js";
import { parsePiStudioComponentStatus, parsePiStudioVersionResponse } from "./shared/piStudioStatusParsing.js";

const PI_STUDIO_PACKAGE_NAME = "@pi-studio/pi-studio";
const PI_STUDIO_VERSION_TIMEOUT_MS = 2000;
const NPM_RELEASE_TIMEOUT_MS = 5000;
const PI_STUDIO_VERSION_ENDPOINT_PATH = "/api/pi-studio/version";
const PI_STUDIO_STATUS_ENDPOINT_PATH = "/api/pi-studio/status";
const DEFAULT_PACKAGE_VERSION = "0.0.0-dev";

interface PackageInfo {
  name: string;
  version: string;
  path: string;
}

export interface RunningVersionInfo {
  generatedAt?: string;
  web?: PiStudioComponentStatus;
  sessiond?: PiStudioComponentStatus;
  webError?: string;
  sessiondError?: string;
}

export type NpmReleaseCheck =
  | { status: "available"; latestVersion: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string };

export interface PiStudioVersionReport extends RunningVersionInfo {
  /** Absent unless an explicit release check was requested. */
  release?: NpmReleaseCheck;
}

export interface PiStudioVersionReportOptions {
  /** Explicitly query the latest npm release; ordinary reports stay local. */
  check?: boolean;
  /** Invoking environment for offline/version-check policy (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Environment used only to select and resolve the web/API config. */
  configEnv?: NodeJS.ProcessEnv;
  /** A prior config-selection failure that makes a web/API probe untrustworthy. */
  webEndpointError?: string;
  /** Injectable HTTP boundary for local probes and explicit npm release checks. */
  fetch?: typeof globalThis.fetch;
}

export type RunningComponentId = PiStudioComponentStatus["component"];

/**
 * Readiness rule for `pi-studio doctor`: an expected running component is ready
 * only when the report carries its status and that status is available and not
 * stale. A component missing from the report (an error-only entry) is not
 * ready. Components that are not expected stay informational regardless of
 * state.
 */
export function runningComponentsReady(info: RunningVersionInfo, expected: readonly RunningComponentId[]): boolean {
  return expected.every((id) => {
    const status = info[id];
    return status !== undefined && status.available && !status.stale;
  });
}

/**
 * Readiness probe for service lifecycle waits: the web component is ready when
 * dependency-free web health endpoint responds. Older hosts fall back to
 * version/status reporting. The session daemon is ready when its own health
 * endpoint serves version information.
 */
export async function probeRunningComponentReady(
  component: RunningComponentId,
  options: Pick<PiStudioVersionReportOptions, "configEnv" | "fetch"> = {},
): Promise<boolean> {
  if (component === "sessiond") {
    const sessiond = await collectRunningSessiondInfo();
    return sessiond.component !== undefined;
  }
  const endpoint = webVersionEndpoint(options.configEnv);
  if (endpoint.endpoint === undefined) return false;
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  try {
    const response = await fetchImplementation(new URL("./health", endpoint.endpoint).href, {
      signal: AbortSignal.timeout(PI_STUDIO_VERSION_TIMEOUT_MS),
    });
    if (response.status !== 404) {
      if (!response.ok) return false;
      const health: unknown = await response.json();
      return typeof health === "object" && health !== null && "ok" in health && health.ok === true;
    }
    await fetchPiStudioVersionResponse(endpoint.endpoint, fetchImplementation);
    return true;
  } catch (error) {
    const statusEndpoint = statusEndpointFor(endpoint.endpoint);
    if (!isHttpNotFound(error) || statusEndpoint === endpoint.endpoint) return false;
    try {
      await fetchPiStudioVersionResponse(statusEndpoint, fetchImplementation);
      return true;
    } catch {
      return false;
    }
  }
}

export function packageVersion(): string {
  return readPackageInfo()?.version ?? DEFAULT_PACKAGE_VERSION;
}

export async function printPiStudioVersionReport(options: PiStudioVersionReportOptions = {}): Promise<PiStudioVersionReport> {
  console.log("PI STUDIO version");
  printInstalledPackageVersions();
  const runningInfo = await collectRunningVersionInfo(options);
  printRunningVersionInfo(runningInfo);
  if (options.check !== true) return runningInfo;
  const release = await checkLatestNpmRelease(options);
  console.log("Latest npm release:");
  if (release.status === "available") console.log(`✓ ${PI_STUDIO_PACKAGE_NAME}: ${release.latestVersion}`);
  else if (release.status === "skipped") console.log(`? skipped: ${release.reason}`);
  else console.log(`! npm release check failed: ${release.error}`);
  return { ...runningInfo, release };
}

async function checkLatestNpmRelease(options: PiStudioVersionReportOptions): Promise<NpmReleaseCheck> {
  const env = options.env ?? process.env;
  const disabledBy = ["PI_STUDIO_SKIP_VERSION_CHECK", "PI_STUDIO_OFFLINE", "PI_SKIP_VERSION_CHECK", "PI_OFFLINE"]
    .filter((key) => env[key] !== undefined && env[key] !== "");
  if (disabledBy.length > 0) return { status: "skipped", reason: `remote version checks disabled by ${disabledBy.join(", ")}` };

  const controller = new AbortController();
  try {
    const latestVersion = await withTimeout((async () => {
      const response = await (options.fetch ?? globalThis.fetch)(`https://registry.npmjs.org/${encodeURIComponent(PI_STUDIO_PACKAGE_NAME)}/latest`, {
        headers: { accept: "application/json", "user-agent": `${PI_STUDIO_PACKAGE_NAME}/${packageVersion()}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`npm registry returned HTTP ${String(response.status)}`);
      const data: unknown = await response.json();
      const version = isRecord(data) ? data["version"] : undefined;
      if (typeof version !== "string" || version.trim() === "") throw new Error("npm registry response did not include a version");
      return version.trim();
    })(), NPM_RELEASE_TIMEOUT_MS, "npm registry check timed out after 5000 ms");
    return { status: "available", latestVersion };
  } catch (error) {
    return { status: "error", error: errorMessage(error) };
  } finally {
    // Cancel transport/body work on timeout as well as clearing the deadline timer.
    controller.abort();
  }
}

function packageRootPath(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

function packageJsonPath(): string {
  return join(packageRootPath(), "package.json");
}

function readPackageInfo(): PackageInfo | undefined {
  const path = packageJsonPath();
  try {
    return parsePackageInfo(JSON.parse(readFileSync(path, "utf8")), path);
  } catch {
    return undefined;
  }
}

function parsePackageInfo(value: unknown, path: string): PackageInfo | undefined {
  if (!isRecord(value)) return undefined;
  const name = value["name"];
  const version = value["version"];
  if (typeof name !== "string" || name === "" || typeof version !== "string" || version === "") return undefined;
  return { name, version, path };
}

function webVersionEndpoint(configEnv: NodeJS.ProcessEnv | undefined): { endpoint?: string; error?: string } {
  try {
    const { config } = effectivePiStudioConfig(configEnv === undefined ? {} : { env: configEnv });
    const host = httpClientHost(config.host);
    const port = config.port ?? 8504;
    return { endpoint: `http://${urlHost(host)}:${String(port)}${PI_STUDIO_VERSION_ENDPOINT_PATH}` };
  } catch (error) {
    return { error: `could not read PI STUDIO config: ${errorMessage(error)}` };
  }
}

function httpClientHost(configuredHost: string | undefined): string {
  const host = configuredHost === undefined || configuredHost === "" ? "127.0.0.1" : configuredHost;
  if (host === "0.0.0.0" || host === "::" || host === "[::]") return "127.0.0.1";
  return host;
}

function urlHost(host: string): string {
  if (host.startsWith("[") || !host.includes(":")) return host;
  return `[${host}]`;
}

function statusEndpointFor(versionEndpoint: string): string {
  if (!versionEndpoint.endsWith(PI_STUDIO_VERSION_ENDPOINT_PATH)) return versionEndpoint;
  return `${versionEndpoint.slice(0, -PI_STUDIO_VERSION_ENDPOINT_PATH.length)}${PI_STUDIO_STATUS_ENDPOINT_PATH}`;
}

async function fetchPiStudioVersionResponse(
  endpoint: string,
  fetchImplementation: typeof globalThis.fetch,
): Promise<PiStudioVersionResponse> {
  const response = await fetchImplementation(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(PI_STUDIO_VERSION_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  const parsed: unknown = await response.json();
  const status = parsePiStudioVersionResponse(parsed);
  if (status === undefined) throw new Error("response did not include PI STUDIO version information");
  return status;
}

async function collectRunningVersionInfo(options: PiStudioVersionReportOptions): Promise<RunningVersionInfo> {
  const endpoint = options.webEndpointError === undefined
    ? webVersionEndpoint(options.configEnv)
    : { error: options.webEndpointError };
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (endpoint.endpoint !== undefined) {
    try {
      const status = await fetchPiStudioVersionResponse(endpoint.endpoint, fetchImplementation);
      return { generatedAt: status.generatedAt, web: status.components.web, sessiond: status.components.sessiond };
    } catch (error) {
      let webError = `${endpoint.endpoint}: ${errorMessage(error)}`;
      const statusEndpoint = statusEndpointFor(endpoint.endpoint);
      if (statusEndpoint !== endpoint.endpoint && isHttpNotFound(error)) {
        try {
          const status = await fetchPiStudioVersionResponse(statusEndpoint, fetchImplementation);
          return { generatedAt: status.generatedAt, web: status.components.web, sessiond: status.components.sessiond };
        } catch (statusError) {
          webError = `${webError}; ${statusEndpoint}: ${errorMessage(statusError)}`;
        }
      }
      return runningVersionInfoWithSessiondFallback({ webError });
    }
  }

  return runningVersionInfoWithSessiondFallback({ webError: endpoint.error ?? "web/API status endpoint unavailable" });
}

async function runningVersionInfoWithSessiondFallback(base: { webError: string }): Promise<RunningVersionInfo> {
  const sessiond = await collectRunningSessiondInfo();
  return {
    webError: base.webError,
    ...(sessiond.component === undefined ? {} : { sessiond: sessiond.component }),
    ...(sessiond.error === undefined ? {} : { sessiondError: sessiond.error }),
  };
}

async function collectRunningSessiondInfo(): Promise<{ component?: PiStudioComponentStatus; error?: string }> {
  try {
    const response = await withTimeout(
      new SessionDaemonClient().request("GET", "/health"),
      PI_STUDIO_VERSION_TIMEOUT_MS,
      "session daemon health check timed out",
    );
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`HTTP ${String(response.statusCode)}`);
    const parsed: unknown = response.body === "" ? undefined : JSON.parse(response.body);
    const version = isRecord(parsed) ? parsed["version"] : undefined;
    const component = parsePiStudioComponentStatus(version);
    if (component === undefined) throw new Error("health response did not include version information");
    return { component };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function isHttpNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "HTTP 404";
}

function printInstalledPackageVersions(): void {
  const info = readPackageInfo();
  console.log("Installed packages:");
  if (info === undefined) {
    console.log(`? ${PI_STUDIO_PACKAGE_NAME}: unknown`);
    console.log(`  missing package metadata: ${packageJsonPath()}`);
    return;
  }
  console.log(`✓ ${info.name}: ${info.version}`);
  console.log(`  ${info.path}`);
}

function printRunningVersionInfo(info: RunningVersionInfo): void {
  console.log("Running services:");
  if (info.web === undefined) printUnavailableComponent("Web/UI", info.webError);
  else printComponentVersion(info.web);
  if (info.sessiond === undefined) printUnavailableComponent("Session daemon", info.sessiondError);
  else printComponentVersion(info.sessiond);
  if (info.generatedAt !== undefined) console.log(`  reported by web/API at ${info.generatedAt}`);
}

function printComponentVersion(component: PiStudioComponentStatus): void {
  const icon = component.available ? component.stale ? "!" : "✓" : "?";
  const status = !component.available ? "unavailable" : component.stale ? "restart needed" : "current";
  console.log(`${icon} ${component.label}: ${status}`);
  if (component.available || component.runtimeVersion !== undefined || component.installedVersion !== undefined) {
    console.log(`  running: ${formatVersion(component.runtimeVersion)}; installed: ${formatVersion(component.installedVersion)}`);
  }
  if (component.piVersion !== undefined) console.log(`  pi: ${component.piVersion}`);
  const installation = installationLabel(component.installation);
  if (installation !== undefined) console.log(`  installation: ${installation}`);
  if (component.error !== undefined) console.log(`  ${component.error}`);
}

function printUnavailableComponent(label: string, error: string | undefined): void {
  console.log(`? ${label}: unavailable`);
  if (error !== undefined && error !== "") console.log(`  ${error}`);
}

function installationLabel(installation: PiStudioInstallationInfo | undefined): string | undefined {
  if (installation === undefined) return undefined;
  if (installation.kind === "pi-package") {
    const source = installation.source ?? "Pi package";
    const scope = installation.scope === undefined ? "" : ` · ${installation.scope}`;
    const path = installation.path === undefined ? "" : ` · ${installation.path}`;
    return `${source}${scope}${path}`;
  }
  if (installation.kind === "npm-global") {
    const npmRoot = installation.npmRoot === undefined ? "" : ` · ${installation.npmRoot}`;
    const path = installation.path === undefined ? "" : ` · ${installation.path}`;
    return `global npm package${npmRoot}${path}`;
  }
  if (installation.kind === "local") return installation.path === undefined ? "local checkout" : `local checkout · ${installation.path}`;
  if (installation.kind === "docker") {
    const mode = installation.dockerMode === "dev" ? "Docker development runtime" : "Docker runtime";
    return installation.path === undefined ? mode : `${mode} · ${installation.path}`;
  }
  return installation.path === undefined ? "installation unknown" : `installation unknown · ${installation.path}`;
}

function formatVersion(version: string | undefined): string {
  return version === undefined || version === "" ? "unknown" : version;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
