import type { TerminalMessageKey } from "./messages";

export type TerminalSoftKeyId =
  | "escape"
  | "tab"
  | "ctrl-c"
  | "ctrl-d"
  | "ctrl-z"
  | "ctrl-l"
  | "ctrl-r"
  | "ctrl-u"
  | "ctrl-w"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "arrow-right"
  | "home"
  | "end"
  | "page-up"
  | "page-down"
  | "delete"
  | "backspace"
  | "meta-backward-word"
  | "meta-forward-word";

export interface TerminalModesSnapshot {
  applicationCursorKeysMode: boolean;
}

export interface TerminalSoftKeyDefinition {
  id: TerminalSoftKeyId;
  label: string;
  ariaLabelKey: TerminalMessageKey;
  titleKey: TerminalMessageKey;
}

export const TERMINAL_SOFT_KEYS: readonly TerminalSoftKeyDefinition[] = [
  { id: "escape", label: "Esc", ariaLabelKey: "softKey.escape.aria", titleKey: "softKey.escape.title" },
  { id: "tab", label: "Tab", ariaLabelKey: "softKey.tab.aria", titleKey: "softKey.tab.title" },
  { id: "ctrl-c", label: "Ctrl+C", ariaLabelKey: "softKey.ctrlC.aria", titleKey: "softKey.ctrlC.title" },
  { id: "ctrl-d", label: "Ctrl+D", ariaLabelKey: "softKey.ctrlD.aria", titleKey: "softKey.ctrlD.title" },
  { id: "ctrl-z", label: "Ctrl+Z", ariaLabelKey: "softKey.ctrlZ.aria", titleKey: "softKey.ctrlZ.title" },
  { id: "ctrl-l", label: "Ctrl+L", ariaLabelKey: "softKey.ctrlL.aria", titleKey: "softKey.ctrlL.title" },
  { id: "ctrl-r", label: "Ctrl+R", ariaLabelKey: "softKey.ctrlR.aria", titleKey: "softKey.ctrlR.title" },
  { id: "ctrl-u", label: "Ctrl+U", ariaLabelKey: "softKey.ctrlU.aria", titleKey: "softKey.ctrlU.title" },
  { id: "ctrl-w", label: "Ctrl+W", ariaLabelKey: "softKey.ctrlW.aria", titleKey: "softKey.ctrlW.title" },
  { id: "arrow-left", label: "←", ariaLabelKey: "softKey.arrowLeft.aria", titleKey: "softKey.arrowLeft.title" },
  { id: "arrow-up", label: "↑", ariaLabelKey: "softKey.arrowUp.aria", titleKey: "softKey.arrowUp.title" },
  { id: "arrow-down", label: "↓", ariaLabelKey: "softKey.arrowDown.aria", titleKey: "softKey.arrowDown.title" },
  { id: "arrow-right", label: "→", ariaLabelKey: "softKey.arrowRight.aria", titleKey: "softKey.arrowRight.title" },
  { id: "home", label: "Home", ariaLabelKey: "softKey.home.aria", titleKey: "softKey.home.title" },
  { id: "end", label: "End", ariaLabelKey: "softKey.end.aria", titleKey: "softKey.end.title" },
  { id: "page-up", label: "PgUp", ariaLabelKey: "softKey.pageUp.aria", titleKey: "softKey.pageUp.title" },
  { id: "page-down", label: "PgDn", ariaLabelKey: "softKey.pageDown.aria", titleKey: "softKey.pageDown.title" },
  { id: "delete", label: "Del", ariaLabelKey: "softKey.delete.aria", titleKey: "softKey.delete.title" },
  { id: "backspace", label: "⌫", ariaLabelKey: "softKey.backspace.aria", titleKey: "softKey.backspace.title" },
  { id: "meta-backward-word", label: "M-B", ariaLabelKey: "softKey.metaB.aria", titleKey: "softKey.metaB.title" },
  { id: "meta-forward-word", label: "M-F", ariaLabelKey: "softKey.metaF.aria", titleKey: "softKey.metaF.title" },
];

const ESC = "\x1b";
const DEL = "\x7f";

export function terminalSoftKeySequence(key: TerminalSoftKeyId, modes?: TerminalModesSnapshot): string {
  switch (key) {
    case "escape": return ESC;
    case "tab": return "\t";
    case "ctrl-c": return controlSequence("c");
    case "ctrl-d": return controlSequence("d");
    case "ctrl-z": return controlSequence("z");
    case "ctrl-l": return controlSequence("l");
    case "ctrl-r": return controlSequence("r");
    case "ctrl-u": return controlSequence("u");
    case "ctrl-w": return controlSequence("w");
    case "arrow-left": return cursorSequence("D", modes);
    case "arrow-up": return cursorSequence("A", modes);
    case "arrow-down": return cursorSequence("B", modes);
    case "arrow-right": return cursorSequence("C", modes);
    case "home": return cursorEndpointSequence("H", modes);
    case "end": return cursorEndpointSequence("F", modes);
    case "page-up": return `${ESC}[5~`;
    case "page-down": return `${ESC}[6~`;
    case "delete": return `${ESC}[3~`;
    case "backspace": return DEL;
    case "meta-backward-word": return `${ESC}b`;
    case "meta-forward-word": return `${ESC}f`;
  }
}

function controlSequence(letter: string): string {
  return String.fromCharCode(letter.toUpperCase().charCodeAt(0) - 64);
}

function cursorSequence(code: "A" | "B" | "C" | "D", modes: TerminalModesSnapshot | undefined): string {
  return modes?.applicationCursorKeysMode === true ? `${ESC}O${code}` : `${ESC}[${code}`;
}

function cursorEndpointSequence(code: "F" | "H", modes: TerminalModesSnapshot | undefined): string {
  return modes?.applicationCursorKeysMode === true ? `${ESC}O${code}` : `${ESC}[${code}`;
}
