export type PiStudioDockerMode = "runtime" | "dev";
export type PiStudioDockerCommand =
  | "install"
  | "start"
  | "stop"
  | "restart"
  | "restart-web"
  | "restart-sessiond"
  | "update"
  | "status"
  | "logs"
  | "shell"
  | "doctor"
  | "cli"
  | "help";

export function piStudioDockerCommandPrefix(mode: PiStudioDockerMode | undefined): string {
  return mode === "dev" ? "pi-studio-docker --dev" : "pi-studio-docker";
}

export function piStudioDockerCommand(mode: PiStudioDockerMode | undefined, command: Exclude<PiStudioDockerCommand, "help">): string {
  return `${piStudioDockerCommandPrefix(mode)} ${command}`;
}
