export const REQUIRED_TERMINAL_PLUGIN_ID = "pi-studio.terminal";

export type TerminalPluginMode = "required" | "recovery-disabled";

export function terminalPluginModeForSafeStart(safeStart: "bundled-only" | "none" | undefined): TerminalPluginMode {
  return safeStart === "none" ? "recovery-disabled" : "required";
}

export const REQUIRED_TERMINAL_RECOVERY_GUIDANCE = "Use `pi-studio plugins safe-start set none --restart` to start PI STUDIO without Terminal for recovery.";
