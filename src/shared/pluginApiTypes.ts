// Dependency-free DTOs shared by PI STUDIO's public plugin entrypoints and host protocols.

export type MachineKind = "local" | "remote";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * Typed token for one exact host/plugin capability version. The provider id
 * and package-local id together with the version form the stable capability
 * identity; matching keys do not imply matching parsers. `parse` validates and
 * may snapshot values at provider, declared-requirement, and resolution boundaries.
 * Parsers must be pure (no input mutation or lifecycle side effects) and tolerate
 * repeated calls; invocation counts and returned object identity are not guaranteed.
 * A resolver's parser receives the provider-parsed value, not the discarded result
 * of declared-requirement validation.
 */
export interface PluginCapability<Value = unknown, Version extends number = number> {
  readonly pluginId: string;
  readonly id: string;
  readonly version: Version;
  readonly parse: (value: unknown) => Value;
}

/** One capability value declaratively published by its owning plugin. */
export interface PluginCapabilityProvision<Value = unknown, Version extends number = number> {
  readonly capability: PluginCapability<Value, Version>;
  readonly value: Value;
}

export interface WorkspaceProviderCapabilities {
  /** True only when this specific workspace advertises removal. */
  readonly remove: boolean;
}

/** Public identity and browser-visible data for the plugin that owns a workspace. */
export interface WorkspaceProviderMetadata {
  readonly pluginId: string;
  readonly capabilities: WorkspaceProviderCapabilities;
  readonly metadata?: JsonObject;
}

/** Provider-authored removal wording exposed to browser plugins. */
export interface WorkspaceRemovalPresentation {
  readonly actionLabel: string;
  readonly confirmation: string;
}

export interface FileTreeEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
  modifiedAt?: string;
}

export interface FileTreeResponse {
  path: string;
  entries: FileTreeEntry[];
  scannedAt: string;
  truncated: boolean;
}

export type FileContentMediaType = "image" | "html" | "pdf" | "markdown";

export interface FileContentResponse {
  path: string;
  language?: string;
  mediaType?: FileContentMediaType;
  mimeType?: string;
  encoding: "utf8";
  size: number;
  modifiedAt: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

export interface WriteWorkspaceFileOptions {
  createDirs?: boolean;     // default: true — mkdir -p equivalent
  overwrite?: boolean;      // default: true — throw if false and file exists
}

export interface WriteWorkspaceFileResponse {
  path: string;
  size: number;
  modifiedAt: string;
  created: boolean;  // true if the file was created, false if it was overwritten
}

export interface DeleteWorkspaceFileResponse {
  path: string;
  existed: boolean;  // true if the file existed and was deleted, false if it did not exist
}

export interface MoveWorkspaceFileOptions {
  createDirs?: boolean;   // default: true — mkdir -p equivalent for target parent directory
  overwrite?: boolean;    // default: false — throw if target exists (safer default than writeFile)
}

export interface MoveWorkspaceFileResponse {
  fromPath: string;
  toPath: string;
  size: number;
  modifiedAt: string;
}

export type TerminalCommandRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface TerminalCommandRun {
  id: string;
  origin: string;
  projectId: string;
  workspaceId: string;
  terminalId: string;
  title: string;
  command: string;
  status: TerminalCommandRunStatus;
  exitCode?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata: Record<string, string>;
}

export interface TerminalCommandRunHandle {
  run: TerminalCommandRun;
  completed: Promise<TerminalCommandRun>;
}

export type PiStudioServiceComponent = "web" | "sessiond";
export type PiStudioStatusSeverity = "info" | "warning" | "error";
export type PiStudioInstallationKind = "pi-package" | "npm-global" | "local" | "docker" | "unknown";
export type PiStudioDockerMode = "runtime" | "dev";

export interface PiStudioInstallationInfo {
  kind: PiStudioInstallationKind;
  path?: string;
  source?: string;
  scope?: "user" | "project";
  npmRoot?: string;
  dockerMode?: PiStudioDockerMode;
}

export interface PiStudioComponentStatus {
  component: PiStudioServiceComponent;
  label: string;
  runtimeVersion?: string;
  installedVersion?: string;
  /** Version of the Pi coding agent library loaded by this component's process; omitted when the component does not report it. */
  piVersion?: string;
  stale: boolean;
  available: boolean;
  installation?: PiStudioInstallationInfo;
  error?: string;
}

export interface PiStudioReleaseStatus {
  packageName: string;
  latestVersion?: string;
  updateAvailable: boolean;
  checkedAt?: string;
  skipped?: boolean;
  error?: string;
}

export interface PiStudioStatusMessage {
  id: string;
  severity: PiStudioStatusSeverity;
  title: string;
  body: string;
  command?: string;
}

export interface PiStudioVersionResponse {
  packageName: string;
  generatedAt: string;
  components: {
    web: PiStudioComponentStatus;
    sessiond: PiStudioComponentStatus;
  };
}

export interface PiStudioStatusResponse extends PiStudioVersionResponse {
  release: PiStudioReleaseStatus;
  commands: {
    update?: string;
    restart?: string;
    restartWeb?: string;
    restartSessiond?: string;
    status?: string;
  };
  messages: PiStudioStatusMessage[];
}
