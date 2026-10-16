import { t } from "../../i18n";
import { isSessionActive } from "../../../../shared/activity";
import type { AppState } from "../../appState";
import { isArchivableSessionInfo, isTransientNewSessionInfo } from "../../sessionPersistence";
import { canDeleteWorkspace, isWorkspaceDeletionPending } from "../../workspaceDeletion";
import type { PluginAction } from "../types";

export function createCoreActions(): PluginAction[] {
  return [
    {
      id: "actions.show",
      title: t("coreAction.showActions.title"),
      description: t("coreAction.showActions.description"),
      shortcut: "mod+k",
      group: "General",
      run: (context) => { context.openActionPalette(); },
    },
    {
      id: "prompt.focus",
      title: t("coreAction.focusPrompt.title"),
      description: t("coreAction.focusPrompt.description"),
      shortcut: "mod+g c",
      group: "General",
      run: (context) => { context.focusPrompt(); },
    },
    {
      id: "machine.add",
      title: t("coreAction.addMachine.title"),
      description: t("coreAction.addMachine.description"),
      group: "Machine",
      run: (context) => context.addMachine(),
    },
    {
      id: "machine.refresh",
      title: t("coreAction.refreshMachine.title"),
      description: t("coreAction.refreshMachine.description"),
      group: "Machine",
      run: (context) => context.refreshSelectedMachine(),
    },
    {
      id: "machine.open",
      title: t("coreAction.openMachine.title"),
      description: t("coreAction.openMachine.description"),
      group: "Machine",
      enabled: (context) => context.state.selectedMachine?.kind === "remote" && context.state.selectedMachine.baseUrl !== undefined,
      run: (context) => context.openSelectedMachine(),
    },
    {
      id: "machine.remove",
      title: t("coreAction.removeMachine.title"),
      description: t("coreAction.removeMachine.description"),
      group: "Machine",
      enabled: (context) => context.state.selectedMachine?.kind === "remote",
      run: (context) => context.removeSelectedMachine(),
    },
    {
      id: "project.add",
      title: t("coreAction.addProject.title"),
      group: "Project",
      run: (context) => context.addProject(),
    },
    {
      id: "auth.login",
      title: t("coreAction.login.title"),
      description: t("coreAction.login.description"),
      group: "General",
      run: (context) => context.configureAuth(),
    },
    {
      id: "auth.logout",
      title: t("coreAction.logout.title"),
      description: t("coreAction.logout.description"),
      group: "General",
      run: (context) => context.logoutAuth(),
    },
    {
      id: "theme.select",
      title: t("coreAction.selectTheme.title"),
      description: t("coreAction.selectTheme.description"),
      group: "Preferences",
      run: (context) => { context.openThemePicker(); },
    },
    {
      id: "settings.open",
      title: t("coreAction.openSettings.title"),
      description: t("coreAction.openSettings.description"),
      shortcut: "mod+,",
      group: "Preferences",
      run: (context) => { context.piStudioUnstable?.openSettings?.(); },
    },
    {
      id: "app.reload-page",
      title: t("coreAction.reloadPage.title"),
      description: t("coreAction.reloadPage.description"),
      group: "General",
      run: (context) => { context.reloadPage(); },
    },
    {
      id: "view.chat",
      title: t("coreAction.goToChat.title"),
      shortcut: "mod+1",
      group: "Navigation",
      run: (context) => { context.focusPrompt(); },
    },
    {
      id: "workspace.delete",
      title: t("coreAction.removeWorkspace.title"),
      description: t("coreAction.removeWorkspace.description"),
      group: "Workspace",
      enabled: hasDeletableWorkspace,
      run: (context) => context.deleteWorkspace(),
    },
    {
      id: "session.start",
      title: t("coreAction.startSession.title"),
      shortcut: "mod+enter",
      group: "Session",
      enabled: hasWorkspace,
      run: (context) => context.startSession(),
    },
    {
      id: "model.select",
      title: t("coreAction.selectModel.title"),
      description: t("coreAction.selectModel.description"),
      group: "Session",
      enabled: hasSelectableSession,
      run: (context) => context.openModelPicker(),
    },
    {
      id: "thinking.select",
      title: t("coreAction.selectThinking.title"),
      description: t("coreAction.selectThinking.description"),
      group: "Session",
      enabled: hasSelectableSession,
      run: (context) => context.openThinkingLevelPicker(),
    },
    {
      id: "session.archive",
      title: t("coreAction.archiveSession.title"),
      description: t("coreAction.archiveSession.description"),
      group: "Session",
      enabled: hasArchivableSession,
      run: (context) => context.archiveSession(),
    },
    {
      id: "session.reload",
      title: t("coreAction.reloadSession.title"),
      description: t("coreAction.reloadSession.description"),
      group: "Session",
      enabled: hasReloadableSession,
      run: (context) => context.reloadSession(),
    },
    {
      id: "session.delete",
      title: t("coreAction.deleteSession.title"),
      description: t("coreAction.deleteSession.description"),
      group: "Session",
      enabled: hasTransientNewSession,
      run: (context) => context.deleteCachedNewSession(),
    },
    {
      id: "session.stop",
      title: t("coreAction.stopWork.title"),
      shortcut: "mod+.",
      group: "Session",
      enabled: (context) => context.state.selectedSession !== undefined && isSessionActive(context.state.status, context.state.activity),
      run: (context) => context.stopActiveWork(),
    },
  ];
}

function hasWorkspace(context: { state: AppState }): boolean {
  return context.state.selectedWorkspace !== undefined;
}

function hasDeletableWorkspace(context: { state: AppState }): boolean {
  const workspace = context.state.selectedWorkspace;
  return canDeleteWorkspace(workspace) && !isWorkspaceDeletionPending(context.state, workspace);
}

function hasSelectableSession(context: { state: AppState }): boolean {
  const session = context.state.selectedSession;
  return session !== undefined && session.archived !== true;
}

function hasArchivableSession(context: { state: AppState }): boolean {
  return isArchivableSessionInfo(context.state.selectedSession, context.state.status);
}

function hasTransientNewSession(context: { state: AppState }): boolean {
  return isTransientNewSessionInfo(context.state.selectedSession, context.state.status);
}

function hasReloadableSession(context: { state: AppState }): boolean {
  if (!isArchivableSessionInfo(context.state.selectedSession, context.state.status)) return false;
  return !isSessionActive(context.state.status, context.state.activity);
}
