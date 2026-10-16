export type PiWebDockerMode = "runtime" | "dev";
export type PiWebDockerCommand =
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

export function piWebDockerCommandPrefix(mode: PiWebDockerMode | undefined): string {
  return mode === "dev" ? "pi-web-docker --dev" : "pi-web-docker";
}

export function piWebDockerCommand(mode: PiWebDockerMode | undefined, command: Exclude<PiWebDockerCommand, "help">): string {
  return `${piWebDockerCommandPrefix(mode)} ${command}`;
}
