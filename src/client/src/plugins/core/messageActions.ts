import { t } from "../../i18n";
import { html } from "lit";
import type { MessageActionAvailabilityContext, MessageActionContribution } from "../../../../plugin-api";
import { writeClipboardText } from "../../clipboard";

export function createCoreMessageActions(writeText = writeClipboardText): MessageActionContribution[] {
  const historyAction = {
    visible: ({ message }: MessageActionAvailabilityContext) => message.role === "user" || message.role === "assistant",
    enabled: ({ session }: MessageActionAvailabilityContext) => !session.archived && !session.pending && !session.busy,
  };
  return [{
    ...historyAction,
    id: "message.fork",
    title: t("messageAction.fork.title"),
    icon: html`<span class="msg-fork-icon" aria-hidden="true">⑂</span>`,
    run: async ({ history }) => {
      if (window.confirm(t("messageAction.fork.confirm"))) await history.fork();
    },
  }, {
    ...historyAction,
    id: "message.back",
    title: t("messageAction.back.title"),
    icon: html`<svg aria-hidden="true" width="16" height="16" viewBox="-3 -3 30 30" fill="none" stroke="currentColor" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round"><path vector-effect="non-scaling-stroke" d="M4 5h11a6 6 0 0 1 0 12H4m5-5-5 5 5 5" /></svg>`,
    run: async ({ history }) => {
      if (window.confirm(t("messageAction.back.confirm"))) await history.goBack();
    },
  }, {
    target: "display",
    id: "message.copy",
    title: t("messageAction.copy.title"),
    ariaLabel: ({ message }) => t("messageAction.copy.ariaLabel", { role: t(message.role === "user" ? "role.user" : "role.assistant") }),
    icon: html`<span aria-hidden="true">⧉</span>`,
    visible: ({ message }) => (message.role === "user" || message.role === "assistant") && message.text !== "",
    run: async ({ message }) => {
      if (!await writeText(message.text)) throw new Error(t("messageAction.copy.failed"));
      return { title: t("messageAction.copy.copied"), ariaLabel: t("messageAction.copy.copiedAriaLabel", { role: t(message.role === "user" ? "role.user" : "role.assistant") }), icon: html`<span aria-hidden="true">✓</span>` };
    },
  }];
}
