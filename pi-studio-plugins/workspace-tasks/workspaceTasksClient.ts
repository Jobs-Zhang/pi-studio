import { TASKS_CONFIG_PATH, parseTasksConfigText, type WorkspaceTasksConfig } from "./config.js";
import { t } from "./messages.js";

export function tasksConfigMissingMessage(): string {
  return t("config.missingMessage");
}

export function tasksConfigMissingHint(): string {
  return t("config.missingHint", { path: TASKS_CONFIG_PATH });
}

export function tasksConfigUnavailableMessage(): string {
  return t("config.unavailableMessage");
}

export function tasksConfigRefreshHint(): string {
  return t("config.refreshHint", { path: TASKS_CONFIG_PATH });
}

const missingWorkspaceFileError = "Path does not exist";

export interface WorkspaceTasksFileReader {
  readFile(path: string): Promise<WorkspaceTasksFileContent>;
}

interface WorkspaceTasksFileContent {
  content: string;
  truncated: boolean;
  binary: boolean;
}

export type WorkspaceTasksConfigLoadResult =
  | { kind: "loaded"; config: WorkspaceTasksConfig; path: string }
  | { kind: "missing"; message: string; hint: string }
  | { kind: "unavailable"; message: string; hint: string; detail?: string };

export async function loadWorkspaceTasksConfig(files: WorkspaceTasksFileReader): Promise<WorkspaceTasksConfigLoadResult> {
  let file: WorkspaceTasksFileContent;
  try {
    file = await files.readFile(TASKS_CONFIG_PATH);
  } catch (error) {
    if (errorMessage(error) === missingWorkspaceFileError) return missing();
    return unavailable(t("config.readFailed", { path: TASKS_CONFIG_PATH, error: formatUnknownError(error) }));
  }

  if (file.binary) return unavailable(t("config.notText", { path: TASKS_CONFIG_PATH }));
  if (file.truncated) return unavailable(t("config.truncated", { path: TASKS_CONFIG_PATH }));

  const result = parseTasksConfigText(file.content);
  if (!result.ok) return unavailable(result.error);
  return { kind: "loaded", config: result.config, path: TASKS_CONFIG_PATH };
}

function missing(): WorkspaceTasksConfigLoadResult {
  return {
    kind: "missing",
    message: tasksConfigMissingMessage(),
    hint: tasksConfigMissingHint(),
  };
}

function unavailable(detail: string): WorkspaceTasksConfigLoadResult {
  return {
    kind: "unavailable",
    message: tasksConfigUnavailableMessage(),
    hint: tasksConfigRefreshHint(),
    detail,
  };
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
