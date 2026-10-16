import { t } from "../../i18n";
import { LitElement, css, html, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { customElement, property, query, state } from "lit/decorators.js";
import type { Machine, MachineHealth, Project, SessionActivity, SessionInfo, SessionStatus, Workspace } from "../../api";
import type { MachineStatusSnapshot } from "../../../../shared/machineStatus";
import type { WorkspaceLabelItem } from "../../plugins/types";
import { selectedMachineId } from "../../controllers/types";
import type { NavigationSection } from "../../appShell/navigationState";
import { NAVIGATION_SECTION_ORDER } from "../../appShell/navigationState";
import type { KeyboardNavigableSection } from "../navigationFocus";
import {
  navigationSectionSplitHeightFromDrag,
  navigationSectionSplitHeightFromKeyboard,
  navigationSectionWeight,
  navigationSectionWeightsAfterReset,
  navigationSectionWeightsAfterResize,
  readStoredNavigationSectionWeights,
  writeStoredNavigationSectionWeights,
  type NavigationSectionWeights,
} from "../../appShell/navigationSectionSplit";
import "../MachineList";
import "../MachineSwitcher";
import { actionMenuPanelStyle } from "../actionMenu";
import { listStyles } from "../shared";
import { hasStatusUnread, renderActionActivityIndicator, statusActivityKind } from "../activityBadge";
import "../WorkspaceList";
import "../SessionList";

export type NavigationFocusTarget = NavigationSection | "chat";

const NAVIGATION_SECTION_TAGS: Record<NavigationSection, string> = {
  machines: "machine-list",
  projects: ".navigation-tree",
  workspaces: "workspace-list",
  sessions: "session-list",
};

const SECTION_SPLIT_TAP_MOVE_TOLERANCE_PX = 4;
const SECTION_SPLIT_DOUBLE_TAP_RESET_MS = 420;

interface ActiveSectionSplit {
  pointerId: number;
  startClientY: number;
  startUpperHeight: number;
  pairHeight: number;
  upper: NavigationSection;
  lower: NavigationSection;
  handle: HTMLElement;
  moved: boolean;
}

@customElement("app-navigation-panel")
export class AppNavigationPanel extends LitElement {
  @property({ attribute: false }) machines: Machine[] = [];
  @property({ attribute: false }) selectedMachine?: Machine;
  /** PWA display mode: surfaces the single-machine identity bubble in the header. */
  @property({ type: Boolean }) locationIndicator = false;
  @property({ attribute: false }) machineStatuses: Record<string, MachineHealth> = {};
  @property({ attribute: false }) machineStatusSnapshots: Record<string, MachineStatusSnapshot> = {};
  @property({ attribute: false }) projects: Project[] = [];
  @property({ attribute: false }) selectedProject?: Project;
  @property({ attribute: false }) workspaces: Workspace[] = [];
  @property({ attribute: false }) workspacesByProjectId: Record<string, Workspace[]> = {};
  @property({ attribute: false }) selectedWorkspace?: Workspace;
  @property({ attribute: false }) sessions: SessionInfo[] = [];
  @property({ attribute: false }) selectedSession?: SessionInfo;
  @property({ attribute: false }) sessionActivities: Record<string, SessionActivity> = {};
  @property({ attribute: false }) sessionStatuses: Record<string, SessionStatus> = {};
  @property({ attribute: false }) sendingPrompts: Record<string, true> = {};
  @property({ attribute: false }) unreadSessionIds: ReadonlySet<string> = new Set();
  @property({ attribute: false }) deletingWorkspaceIds: string[] = [];
  // Unlike event callbacks, this provider affects rendered content; replacements
  // must remain reactive inputs to WorkspaceList.
  @property({ attribute: false }) workspaceLabelItems: (workspace: Workspace) => WorkspaceLabelItem[] = () => [];
  @property({ attribute: false }) refreshControl: unknown;
  @property({ type: Boolean, reflect: true }) collapsible = false;
  @property({ type: Boolean, reflect: true }) compact = false;
  @property({ type: Boolean }) machinesCollapsed = false;
  @property({ type: Boolean }) projectsCollapsed = false;
  @property({ type: Boolean }) workspacesCollapsed = false;
  @property({ type: Boolean }) sessionsCollapsed = false;
  @property({ type: Number }) startingSessionCount = 0;
  @property({ type: Boolean }) canStartSession = false;
  @property({ attribute: false }) onShowActions?: () => void;
  @property({ attribute: false }) onToggleMachines?: () => void;
  @property({ attribute: false }) onToggleProjects?: () => void;
  @property({ attribute: false }) onToggleWorkspaces?: () => void;
  @property({ attribute: false }) onToggleSessions?: () => void;
  @property({ attribute: false }) loadProjectWorkspaces?: (project: Project, signal: AbortSignal) => Promise<Workspace[]>;
  @property({ attribute: false }) loadWorkspaceSessions?: (workspace: Workspace, signal: AbortSignal) => Promise<SessionInfo[]>;
  @property({ attribute: false }) onSelectWorkspaceSession?: (workspace: Workspace, session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onStartWorkspaceSession?: (workspace: Workspace) => void | Promise<void>;
  @property({ attribute: false }) onSelectProject?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onCloseProject?: (project: Project) => void | Promise<void>;
  @property({ attribute: false }) onSelectWorkspace?: (workspace: Workspace) => void | Promise<void>;
  @property({ attribute: false }) onDeleteWorkspace?: (workspace: Workspace) => void | Promise<void>;
  @property({ attribute: false }) onStartSession?: () => void | Promise<void>;
  @property({ attribute: false }) onSelectSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSessionWithDescendants?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onArchiveSessions?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onRestoreSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteCachedNewSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteArchivedSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onDeleteArchivedSessions?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onDetachParentSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onRenameSession?: (session: SessionInfo, name: string) => void | Promise<void>;
  @property({ attribute: false }) onMarkSessionRead?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onMarkSessionsRead?: (sessions: SessionInfo[]) => void | Promise<void>;
  @property({ attribute: false }) onReloadSession?: (session: SessionInfo) => void | Promise<void>;
  @property({ attribute: false }) onCleanupSessions?: () => void | Promise<void>;
  @property({ attribute: false }) onArchivedCollapsed?: () => void | Promise<void>;
  @property({ attribute: false }) onSelectMachine?: (machine: Machine) => void | Promise<void>;
  @property({ attribute: false }) onRemoveMachine?: (machine: Machine) => void | Promise<void>;
  @property({ attribute: false }) onFocusNavigationTarget?: (target: NavigationFocusTarget) => void | Promise<void>;
  @property({ attribute: false }) onCancelKeyboardNavigation?: () => void | Promise<void>;

  @query("machine-list") private machineList?: KeyboardNavigableSection;
  @query("machine-switcher") private machineSwitcher?: KeyboardNavigableSection;

  /** 区块高度权重（持久化于 localStorage）；拖动过程只改内存，松手再落盘。 */
  @state() private sectionWeights: NavigationSectionWeights = readStoredNavigationSectionWeights();
  @state() private openProjectMenuId: string | undefined;
  @state() private projectMenuStyle = "";
  @state() private projectExpansion: ReadonlyMap<string, boolean> = new Map();
  @state() private workspaceExpansion: ReadonlyMap<string, boolean> = new Map();
  @state() private browsedWorkspaces: Record<string, Workspace[]> = {};
  @state() private browsedSessions: Record<string, SessionInfo[]> = {};
  @state() private browseErrors: Record<string, string> = {};
  private browseRequests = new Map<string, AbortController>();

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("selectedMachine") && changed.get("selectedMachine")?.id !== this.selectedMachine?.id) {
      this.cancelBrowseRequests();
      this.openProjectMenuId = undefined;
      this.projectExpansion = new Map();
      this.workspaceExpansion = new Map();
      this.browsedWorkspaces = {};
      this.browsedSessions = {};
      this.browseErrors = {};
    }
    if (changed.has("selectedProject") && changed.get("selectedProject")?.id !== this.selectedProject?.id && this.selectedProject !== undefined) {
      this.projectExpansion = new Map(this.projectExpansion).set(this.selectedProject.id, true);
    }
    if (changed.has("selectedWorkspace") && changed.get("selectedWorkspace")?.id !== this.selectedWorkspace?.id && this.selectedWorkspace !== undefined) {
      this.workspaceExpansion = new Map(this.workspaceExpansion).set(this.selectedWorkspace.id, true);
    }
    if ((changed.has("sessions") || changed.has("selectedWorkspace")) && this.selectedWorkspace !== undefined) {
      this.browsedSessions = { ...this.browsedSessions, [this.selectedWorkspace.id]: this.sessions };
    }
  }

  private activeSectionSplit: ActiveSectionSplit | undefined;
  private lastSectionSplitTapAt = 0;
  private lastSectionSplitPair = "";

  override disconnectedCallback(): void {
    this.cancelBrowseRequests();
    this.finishActiveSectionSplit();
    super.disconnectedCallback();
  }

  async focusSection(section: NavigationSection): Promise<boolean> {
    await this.updateComplete;
    switch (section) {
      case "machines": return await this.focusNavigableSection(this.compact ? this.machineList : this.machineSwitcher);
      case "projects": return this.focusTreeNode(".tree-project .tree-expander");
      case "workspaces": return this.focusTreeNode(".tree-workspace .tree-expander");
      case "sessions": {
        const lists = Array.from(this.renderRoot.querySelectorAll<LitElement & KeyboardNavigableSection & { selected?: SessionInfo }>("session-list"));
        const current = lists.find((list) => list.selected?.id === this.selectedSession?.id && list.selected !== undefined);
        return await this.focusNavigableSection(current ?? lists[0]);
      }
    }
  }

  // Stable child inputs delegate at invocation time, never capturing old props.
  private readonly childCallbacks = {
    toggleProjects: () => { this.onToggleProjects?.(); },
    selectProject: (project: Project) => this.onSelectProject?.(project),
    closeProject: (project: Project) => this.onCloseProject?.(project),
    toggleWorkspaces: () => { this.onToggleWorkspaces?.(); },
    selectWorkspace: (workspace: Workspace) => this.onSelectWorkspace?.(workspace),
    deleteWorkspace: (workspace: Workspace) => this.onDeleteWorkspace?.(workspace),
    toggleSessions: () => { this.onToggleSessions?.(); },
    archivedCollapsed: () => this.onArchivedCollapsed?.(),
    startSession: () => this.onStartSession?.(),
    selectSession: (session: SessionInfo) => this.onSelectSession?.(session),
    archiveSession: (session: SessionInfo) => this.onArchiveSession?.(session),
    archiveSessionWithDescendants: (session: SessionInfo) => this.onArchiveSessionWithDescendants?.(session),
    archiveSessions: (sessions: SessionInfo[]) => this.onArchiveSessions?.(sessions),
    restoreSession: (session: SessionInfo) => this.onRestoreSession?.(session),
    deleteCachedNewSession: (session: SessionInfo) => this.onDeleteCachedNewSession?.(session),
    deleteArchivedSession: (session: SessionInfo) => this.onDeleteArchivedSession?.(session),
    deleteArchivedSessions: (sessions: SessionInfo[]) => this.onDeleteArchivedSessions?.(sessions),
    detachParentSession: (session: SessionInfo) => this.onDetachParentSession?.(session),
    renameSession: (session: SessionInfo, name: string) => this.onRenameSession?.(session, name),
    markSessionRead: (session: SessionInfo) => this.onMarkSessionRead?.(session),
    markSessionsRead: (sessions: SessionInfo[]) => this.onMarkSessionsRead?.(sessions),
    reloadSession: (session: SessionInfo) => this.onReloadSession?.(session),
    cleanupSessions: () => this.onCleanupSessions?.(),
    previousFromProjects: () => { this.focusPreviousFrom("projects"); },
    nextFromProjects: () => { this.focusNextFrom("projects"); },
    previousFromWorkspaces: () => { this.focusPreviousFrom("workspaces"); },
    nextFromWorkspaces: () => { this.focusNextFrom("workspaces"); },
    previousFromSessions: () => { this.focusPreviousFrom("sessions"); },
    nextFromSessions: () => { this.focusNextFrom("sessions"); },
    cancelKeyboardNavigation: () => { this.cancelKeyboardNavigation(); },
  };

  override render() {
    return html`
      <header>
        <strong>PI STUDIO</strong>
        <machine-switcher
          .machines=${this.machines}
          .selected=${this.selectedMachine}
          .locationIndicator=${this.locationIndicator}
          .statuses=${this.machineStatuses}
          .statusSnapshots=${this.machineStatusSnapshots}
          .onSelect=${(machine: Machine) => this.onSelectMachine?.(machine)}
          .onRemove=${(machine: Machine) => this.onRemoveMachine?.(machine)}
          .onFocusNextSection=${() => { this.focusNextFrom("machines"); }}
          .onCancelKeyboardNavigation=${() => { this.cancelKeyboardNavigation(); }}
        ></machine-switcher>
        <div class="header-actions">
          ${this.refreshControl}
          <button title=${t("shell.showActions")} aria-label=${t("shell.showActions")} @click=${() => { this.onShowActions?.(); }}>${t("shell.actions")}</button>
        </div>
      </header>
      ${this.compact && shouldShowMachinesSection(this.machines) ? html`
        <machine-list
          style=${this.sectionGrowStyle("machines")}
          .machines=${this.machines}
          .selected=${this.selectedMachine}
          .statuses=${this.machineStatuses}
          .statusSnapshots=${this.machineStatusSnapshots}
          .collapsible=${this.collapsible}
          .collapsed=${this.machinesCollapsed}
          .onToggleCollapsed=${() => { this.onToggleMachines?.(); }}
          .onSelect=${(machine: Machine) => this.onSelectMachine?.(machine)}
          .onRemove=${(machine: Machine) => this.onRemoveMachine?.(machine)}
          .onFocusNextSection=${() => { this.focusNextFrom("machines"); }}
          .onCancelKeyboardNavigation=${() => { this.cancelKeyboardNavigation(); }}
        ></machine-list>
      ` : null}
      ${this.renderSectionSplit("machines", "projects")}
      <nav class="navigation-tree" aria-label=${t("shell.projectsAndSessions")} @click=${(event: Event) => { if (!(event.target instanceof Element) || event.target.closest(".project-menu") === null) this.openProjectMenuId = undefined; }} @keydown=${(event: KeyboardEvent) => { this.handleTreeKeydown(event); }}>
        ${repeat(this.projects, (project) => project.id, (project) => this.renderProjectNode(project))}
      </nav>
    `;
  }

  private renderProjectNode(project: Project) {
    const expanded = this.projectExpansion.get(project.id) ?? this.selectedProject?.id === project.id;
    const workspaces = this.browsedWorkspaces[project.id] ?? this.workspacesByProjectId[project.id] ?? (this.selectedProject?.id === project.id ? this.workspaces : []);
    const flags = this.selectedMachineStatusSnapshot()?.projects[project.id];
    return html`
      <section class="tree-project">
        <div class="tree-row project-row">
          <button class="tree-expander" aria-label=${`${expanded ? "Collapse" : "Expand"} ${project.name}`} aria-expanded=${String(expanded)} @click=${(event: Event) => { event.stopPropagation(); this.toggleExpandedProject(project.id); }}>${expanded ? "▾" : "▸"}</button>
          <button class="tree-label" title=${project.path} aria-expanded=${String(expanded)} @click=${() => { this.toggleExpandedProject(project.id); }}><svg class="folder-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm0 1h18" /></svg><span>${project.name}</span></button>
          <div class="project-menu action-menu">
            <button class="tree-menu" aria-label=${t("project.actionsFor", { name: project.name })} aria-expanded=${String(this.openProjectMenuId === project.id)} title=${t("project.actions")} @click=${(event: Event) => { this.projectMenuStyle = actionMenuPanelStyle(event.currentTarget, { constrainTo: "viewport" }); this.openProjectMenuId = this.openProjectMenuId === project.id ? undefined : project.id; }}>⋯</button>
            ${this.openProjectMenuId === project.id ? html`<div class="action-menu-panel" style=${this.projectMenuStyle}><button @click=${() => { this.openProjectMenuId = undefined; this.closeProject(project); }}>${t("project.close")}</button></div>` : null}
          </div>
          ${renderActionActivityIndicator(statusActivityKind(flags), "Project active", hasStatusUnread(flags) ? "Unread sessions in project" : undefined)}
        </div>
        ${expanded ? html`<div class="tree-children">
          ${this.renderBrowseFeedback(`project:${project.id}`, () => { void this.browseProject(project); })}
          ${repeat(workspaces, (workspace) => workspace.id, (workspace) => this.renderWorkspaceNode(workspace))}
        </div>` : null}
      </section>
    `;
  }

  private renderWorkspaceNode(workspace: Workspace) {
    const expanded = this.workspaceExpansion.get(workspace.id) ?? this.selectedWorkspace?.id === workspace.id;
    const selected = this.selectedWorkspace?.id === workspace.id;
    const sessions = selected ? this.sessions : this.browsedSessions[workspace.id] ?? [];
    const flags = this.selectedMachineStatusSnapshot()?.workspaces[workspace.id];
    return html`
      <div class="tree-workspace">
        <div class="tree-row workspace-row">
          <button class="tree-expander" aria-label=${`${expanded ? "Collapse" : "Expand"} ${workspace.label}`} aria-expanded=${String(expanded)} @click=${(event: Event) => { event.stopPropagation(); this.toggleExpandedWorkspace(workspace.id); }}> ${expanded ? "▾" : "▸"}</button>
          <button class="tree-label" title=${workspace.path} aria-expanded=${String(expanded)} @click=${() => { this.toggleExpandedWorkspace(workspace.id); }}>⑂ <span>${workspace.label}</span>${workspace.isMain ? html`<small class="tree-badge">${t("shell.mainWorkspace")}</small>` : null}</button>
          <workspace-list
            .menuOnly=${true}
            .workspaces=${[workspace]}
            .machineId=${selectedMachineId({ selectedMachine: this.selectedMachine })}
            .workspaceLabelItems=${this.workspaceLabelItems}
            .deletingWorkspaceIds=${this.deletingWorkspaceIds}
            .onDelete=${this.childCallbacks.deleteWorkspace}
          ></workspace-list>
          ${renderActionActivityIndicator(statusActivityKind(flags), "Workspace active", hasStatusUnread(flags) ? "Unread sessions in workspace" : undefined)}
        </div>
        ${expanded ? html`<div class="tree-session-slot">
          ${this.renderBrowseFeedback(`workspace:${workspace.id}`, () => { void this.browseWorkspace(workspace); })}
          <session-list
            .sessions=${sessions}
            .statuses=${this.sessionStatuses}
            .activities=${this.sessionActivities}
            .sending=${this.sendingPrompts}
            .unreadSessionIds=${this.unreadSessionIds}
            .selected=${selected ? this.selectedSession : undefined}
            .startingCount=${selected ? this.startingSessionCount : 0}
            .canStart=${true}
            .collapsible=${false}
            .onStart=${() => this.onStartWorkspaceSession?.(workspace)}
            .onSelect=${(session: SessionInfo) => this.onSelectWorkspaceSession?.(workspace, session)}
            .onArchive=${(session: SessionInfo) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.archiveSession(session))}
            .onArchiveWithDescendants=${(session: SessionInfo) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.archiveSessionWithDescendants(session))}
            .onArchiveMany=${(sessions: SessionInfo[]) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.archiveSessions(sessions))}
            .onRestore=${(session: SessionInfo) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.restoreSession(session))}
            .onDelete=${(session: SessionInfo) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.deleteCachedNewSession(session))}
            .onDeleteArchived=${(session: SessionInfo) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.deleteArchivedSession(session))}
            .onDeleteArchivedMany=${(sessions: SessionInfo[]) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.deleteArchivedSessions(sessions))}
            .onDetachParent=${(session: SessionInfo) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.detachParentSession(session))}
            .onRename=${(session: SessionInfo, name: string) => this.refreshAfterWorkspaceAction(workspace, () => this.childCallbacks.renameSession(session, name))}
            .onMarkRead=${this.childCallbacks.markSessionRead}
            .onMarkReadMany=${this.childCallbacks.markSessionsRead}
            .onReload=${this.childCallbacks.reloadSession}
            .onCleanup=${this.childCallbacks.cleanupSessions}
            .onFocusPreviousSection=${this.childCallbacks.previousFromSessions}
            .onFocusNextSection=${this.childCallbacks.nextFromSessions}
            .onCancelKeyboardNavigation=${this.childCallbacks.cancelKeyboardNavigation}
          ></session-list>
        </div>` : null}
      </div>
    `;
  }

  private toggleExpandedProject(projectId: string): void {
    const expanded = this.projectExpansion.get(projectId) ?? this.selectedProject?.id === projectId;
    this.projectExpansion = new Map(this.projectExpansion).set(projectId, !expanded);
    const project = this.projects.find((candidate) => candidate.id === projectId);
    if (!expanded && project !== undefined) void this.browseProject(project);
  }

  private toggleExpandedWorkspace(workspaceId: string): void {
    const expanded = this.workspaceExpansion.get(workspaceId) ?? this.selectedWorkspace?.id === workspaceId;
    this.workspaceExpansion = new Map(this.workspaceExpansion).set(workspaceId, !expanded);
    const workspace = [...Object.values(this.browsedWorkspaces).flat(), ...Object.values(this.workspacesByProjectId).flat(), ...this.workspaces].find((candidate) => candidate.id === workspaceId);
    if (!expanded && workspace !== undefined) void this.browseWorkspace(workspace);
  }

  private expandWorkspace(workspace: Workspace): void {
    this.workspaceExpansion = new Map(this.workspaceExpansion).set(workspace.id, true);
    void this.browseWorkspace(workspace);
  }

  private async browseProject(project: Project): Promise<void> {
    const load = this.loadProjectWorkspaces;
    if (load === undefined) return;
    await this.loadBrowse(`project:${project.id}`, async (signal) => {
      const workspaces = await load(project, signal);
      if (signal.aborted) return;
      this.browsedWorkspaces = { ...this.browsedWorkspaces, [project.id]: workspaces };
      const mainWorkspace = workspaces.find((workspace) => workspace.isMain);
      const expanded = this.projectExpansion.get(project.id) ?? this.selectedProject?.id === project.id;
      if (expanded && mainWorkspace !== undefined) this.expandWorkspace(mainWorkspace);
    });
  }

  private async refreshAfterWorkspaceAction(workspace: Workspace, action: () => void | Promise<void>): Promise<void> {
    const machineId = selectedMachineId({ selectedMachine: this.selectedMachine });
    await action();
    if (machineId === selectedMachineId({ selectedMachine: this.selectedMachine })) await this.browseWorkspace(workspace);
  }

  private async browseWorkspace(workspace: Workspace): Promise<void> {
    const load = this.loadWorkspaceSessions;
    if (this.selectedWorkspace?.id === workspace.id || load === undefined) return;
    await this.loadBrowse(`workspace:${workspace.id}`, async (signal) => {
      const sessions = await load(workspace, signal);
      if (!signal.aborted) this.browsedSessions = { ...this.browsedSessions, [workspace.id]: sessions };
    });
  }

  private async loadBrowse(key: string, load: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.browseRequests.has(key)) return;
    const controller = new AbortController();
    this.browseRequests.set(key, controller);
    this.browseErrors = { ...this.browseErrors, [key]: "" };
    try {
      await load(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("导航目录加载失败", key, error);
        this.browseErrors = { ...this.browseErrors, [key]: error instanceof Error ? error.message : String(error) };
      }
    } finally {
      if (this.browseRequests.get(key) === controller) this.browseRequests.delete(key);
      this.requestUpdate();
    }
  }

  private renderBrowseFeedback(key: string, retry: () => void) {
    const error = this.browseErrors[key];
    if (error !== undefined && error !== "") return html`<small class="browse-error" role="alert">${error} <button @click=${retry}>${t("common.retry")}</button></small>`;
    return this.browseRequests.has(key) ? html`<small role="status">${t("shell.loading")}</small>` : null;
  }

  private cancelBrowseRequests(): void {
    for (const controller of this.browseRequests.values()) controller.abort();
    this.browseRequests.clear();
  }

  private closeProject(project: Project): void {
    if (confirm(`Close ${project.name}?\\n\\nThis only removes it from PI STUDIO; it will not change the project folder.`)) void this.onCloseProject?.(project);
  }


  /**
   * Project and workspace rows always belong to the selected machine, resolved
   * exactly as the rest of the app resolves it — including its local-machine
   * default, which is the key snapshots arrive under before a machine has been
   * selected. Diverging here would blank every row's indicator while a snapshot
   * is in fact loaded.
   */
  private selectedMachineStatusSnapshot(): MachineStatusSnapshot | undefined {
    return this.machineStatusSnapshots[selectedMachineId({ selectedMachine: this.selectedMachine })];
  }

  private async focusNavigableSection(section: KeyboardNavigableSection | null | undefined): Promise<boolean> {
    if (section == null) return false;
    return await section.focusSelectedOrFirst();
  }

  private focusTreeNode(selector: string): boolean {
    const target = this.renderRoot.querySelector<HTMLElement>(selector);
    target?.focus();
    return target !== null;
  }

  private handleTreeKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(".tree-label, .tree-expander")) return;
    const row = target.closest<HTMLElement>(".tree-row");
    const rows = Array.from(this.renderRoot.querySelectorAll<HTMLElement>(".tree-row"));
    const index = row === null ? -1 : rows.indexOf(row);
    if (index < 0) return;
    let destination: HTMLElement | null | undefined;
    if (event.key === "ArrowDown") destination = rows[index + 1]?.querySelector<HTMLElement>(".tree-label");
    else if (event.key === "ArrowUp") destination = rows[index - 1]?.querySelector<HTMLElement>(".tree-label");
    else if (event.key === "Home") destination = rows[0]?.querySelector<HTMLElement>(".tree-label");
    else if (event.key === "End") destination = rows.at(-1)?.querySelector<HTMLElement>(".tree-label");
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const expander = row?.querySelector<HTMLButtonElement>(".tree-expander");
      const expanded = expander?.getAttribute("aria-expanded") === "true";
      if (expanded === (event.key === "ArrowLeft")) expander?.click();
      else if (event.key === "ArrowRight") {
        destination = rows[index + 1]?.querySelector<HTMLElement>(".tree-label");
        if (row?.classList.contains("workspace-row") === true) void this.focusSection("sessions");
      } else destination = row?.closest(".tree-children")?.parentElement?.querySelector<HTMLElement>(".project-row .tree-label");
    } else if (event.key === "Escape") this.cancelKeyboardNavigation();
    else return;
    event.preventDefault();
    event.stopPropagation();
    destination?.focus();
    destination?.scrollIntoView({ block: "nearest" });
  }

  private focusPreviousFrom(section: NavigationSection): void {
    const target = previousVisibleNavigationTarget(section, this.machines);
    if (target !== undefined) void this.onFocusNavigationTarget?.(target);
  }

  private focusNextFrom(section: NavigationSection): void {
    void this.onFocusNavigationTarget?.(nextVisibleNavigationTarget(section, this.machines));
  }

  private cancelKeyboardNavigation(): void {
    void this.onCancelKeyboardNavigation?.();
  }

  /* --- 区块之间的水平分隔条：拖动/键盘调整相邻区块高度，双击复位。 --- */

  private renderSectionSplit(upper: NavigationSection, lower: NavigationSection) {
    if (!this.sectionExpanded(upper) || !this.sectionExpanded(lower)) return null;
    const label = `Resize ${upper} and ${lower} sections`;
    return html`
      <div
        class="section-split"
        role="separator"
        aria-orientation="horizontal"
        aria-label=${label}
        title=${`${label}. Double-click or double-tap to reset.`}
        tabindex="0"
        @pointerdown=${(event: PointerEvent) => { this.onSectionSplitPointerDown(event, upper, lower); }}
        @pointermove=${(event: PointerEvent) => { this.onSectionSplitPointerMove(event); }}
        @pointerup=${(event: PointerEvent) => { this.onSectionSplitPointerUp(event); }}
        @pointercancel=${(event: PointerEvent) => { this.onSectionSplitPointerCancel(event); }}
        @dblclick=${(event: MouseEvent) => { event.preventDefault(); this.resetSectionSplit(upper, lower); }}
        @keydown=${(event: KeyboardEvent) => { this.onSectionSplitKeyDown(event, upper, lower); }}
      ></div>
    `;
  }

  private sectionExpanded(section: NavigationSection): boolean {
    switch (section) {
      case "machines": return this.machinesSectionVisible() && !this.machinesCollapsed;
      case "projects": return !this.projectsCollapsed;
      case "workspaces": return !this.workspacesCollapsed;
      case "sessions": return !this.sessionsCollapsed;
    }
  }

  private machinesSectionVisible(): boolean {
    return this.compact && shouldShowMachinesSection(this.machines);
  }

  private sectionGrowStyle(section: NavigationSection): string {
    return this.sectionExpanded(section) ? `flex-grow: ${String(navigationSectionWeight(this.sectionWeights, section))};` : "";
  }

  private onSectionSplitPointerDown(event: PointerEvent, upper: NavigationSection, lower: NavigationSection): void {
    if (event.button !== 0 || this.activeSectionSplit !== undefined) return;
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) return;
    const pair = this.measureSectionPair(upper, lower);
    if (pair === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);
    this.activeSectionSplit = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startUpperHeight: pair.upperHeight,
      pairHeight: pair.upperHeight + pair.lowerHeight,
      upper,
      lower,
      handle,
      moved: false,
    };
    handle.toggleAttribute("active", true);
  }

  private onSectionSplitPointerMove(event: PointerEvent): void {
    const active = this.activeSectionSplit;
    if (active?.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (Math.abs(event.clientY - active.startClientY) <= SECTION_SPLIT_TAP_MOVE_TOLERANCE_PX) return;
    active.moved = true;
    const upperHeight = navigationSectionSplitHeightFromDrag(active.startUpperHeight, active.pairHeight, event.clientY - active.startClientY);
    this.applySectionSplit(active.upper, active.lower, upperHeight, active.pairHeight);
  }

  private onSectionSplitPointerUp(event: PointerEvent): void {
    const active = this.activeSectionSplit;
    if (active?.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.finishActiveSectionSplit();
    if (!active.moved) this.registerSectionSplitTap(active.upper, active.lower);
  }

  private onSectionSplitPointerCancel(event: PointerEvent): void {
    if (this.activeSectionSplit?.pointerId !== event.pointerId) return;
    this.finishActiveSectionSplit();
  }

  private onSectionSplitKeyDown(event: KeyboardEvent, upper: NavigationSection, lower: NavigationSection): void {
    const pair = this.measureSectionPair(upper, lower);
    if (pair === undefined) return;
    const pairHeight = pair.upperHeight + pair.lowerHeight;
    const nextUpperHeight = navigationSectionSplitHeightFromKeyboard(pair.upperHeight, pairHeight, event.key, { largeStep: event.shiftKey });
    if (nextUpperHeight === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    this.applySectionSplit(upper, lower, nextUpperHeight, pairHeight);
    writeStoredNavigationSectionWeights(this.sectionWeights);
  }

  private registerSectionSplitTap(upper: NavigationSection, lower: NavigationSection): void {
    const now = Date.now();
    const pair = `${upper}:${lower}`;
    // 双击判定只对同一条分隔条生效：快速点击不同分隔条不算双击。
    if (now - this.lastSectionSplitTapAt <= SECTION_SPLIT_DOUBLE_TAP_RESET_MS && this.lastSectionSplitPair === pair) {
      this.lastSectionSplitTapAt = 0;
      this.lastSectionSplitPair = "";
      this.resetSectionSplit(upper, lower);
      return;
    }
    this.lastSectionSplitTapAt = now;
    this.lastSectionSplitPair = pair;
  }

  private resetSectionSplit(upper: NavigationSection, lower: NavigationSection): void {
    this.sectionWeights = navigationSectionWeightsAfterReset(this.sectionWeights, upper, lower);
    writeStoredNavigationSectionWeights(this.sectionWeights);
  }

  private applySectionSplit(upper: NavigationSection, lower: NavigationSection, upperHeight: number, pairHeight: number): void {
    this.sectionWeights = navigationSectionWeightsAfterResize(this.sectionWeights, upper, lower, upperHeight, pairHeight);
  }

  private measureSectionPair(upper: NavigationSection, lower: NavigationSection): { upperHeight: number; lowerHeight: number } | undefined {
    const upperElement = this.sectionElement(upper);
    const lowerElement = this.sectionElement(lower);
    if (upperElement === undefined || lowerElement === undefined) return undefined;
    return {
      upperHeight: upperElement.getBoundingClientRect().height,
      lowerHeight: lowerElement.getBoundingClientRect().height,
    };
  }

  private sectionElement(section: NavigationSection): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(NAVIGATION_SECTION_TAGS[section]) ?? undefined;
  }

  private finishActiveSectionSplit(): void {
    const active = this.activeSectionSplit;
    if (active === undefined) return;
    try {
      active.handle.releasePointerCapture(active.pointerId);
    } catch {
      // 浏览器可能已取消拖拽并释放捕获，忽略即可。
    }
    active.handle.toggleAttribute("active", false);
    this.activeSectionSplit = undefined;
    writeStoredNavigationSectionWeights(this.sectionWeights);
  }

  static override styles = [listStyles, css`
    :host { display: flex; flex-direction: column; min-height: 0; overflow: hidden; border-radius: 12px 0 0 12px; }
    :host([compact]) { flex: 1 1 auto; border-radius: 0; }
    header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-bottom: 1px solid var(--pi-border-muted); }
    header strong { flex: 0 0 auto; }
    machine-switcher { flex: 1 1 auto; min-width: 0; }
    :host([compact]) header { display: none; }
    .header-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
    /* 展开区块按权重分配面板高度（默认等权），因此折叠某区块时其空间会分给其余区块，
       而不是只给会话列表；折叠区块只保留标题高度。 */
    machine-list, project-list, workspace-list, session-list { flex: 1 1 0px; min-height: 0; overflow: hidden; }
    .navigation-tree { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; }
    .tree-project { display: block; flex: none; padding: 0; margin: 0 0 3px; }
    .tree-children { margin-left: 12px; padding-left: 7px; border-left: 1px solid var(--pi-border-muted); }
    .tree-row { min-width: 0; display: flex; align-items: center; gap: 4px; min-height: 32px; border-radius: 7px; }
    .tree-row:hover, .tree-session:hover { background: var(--pi-surface-hover); }
    .tree-session.selected { background: var(--pi-selection-bg); }
    .browse-error { color: var(--pi-danger); white-space: normal; }
    .tree-expander, .tree-menu { flex: 0 0 auto; width: 24px; height: 26px; padding: 0; border: 0; background: transparent; color: var(--pi-muted); }
    .tree-label, .tree-session { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; border: 0; border-radius: 6px; background: transparent; color: var(--pi-text); padding: 6px 4px; text-align: left; }
    .folder-icon { flex: 0 0 16px; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .tree-label span, .tree-session span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tree-badge { flex: 0 0 auto; border-radius: 4px; background: var(--pi-surface-hover); padding: 2px 4px; }
    .tree-dot { flex: 0 0 auto; width: 7px; height: 7px; margin: 0 7px; border-radius: 50%; background: var(--pi-accent); }
    .tree-session-slot { margin-left: 12px; padding-left: 7px; border-left: 1px solid var(--pi-border-muted); }
    workspace-list[menu-only] { flex: 0 0 26px; overflow: visible; }
    .tree-row > .action-activity { position: static; flex: 0 0 10px; margin-right: 6px; }
    .tree-session-slot session-list { height: clamp(220px, 48vh, 600px); }
    .tree-session { width: 100%; min-height: 30px; font-size: 13px; }
    .tree-branch { flex: 1 1 0px; min-height: 0; display: flex; flex-direction: column; }
    .tree-sessions { margin-left: 12px; border-left: 1px solid var(--pi-border-muted); }
    .tree-sessions > session-list { padding-left: 6px; }
    .tree-branch > session-list { min-height: 0; }
    machine-list[collapsed],
    project-list[collapsed],
    workspace-list[collapsed],
    session-list[collapsed] { flex: 0 0 auto; min-height: auto; overflow: hidden; }
    /* 分隔条自身 0 高度不占布局：::before 是拖拽热区，::after 是高亮条。 */
    .section-split { position: relative; flex: 0 0 0; height: 0; z-index: 3; outline: none; touch-action: none; }
    .section-split::before { content: ""; position: absolute; top: -4px; left: 0; right: 0; height: 9px; cursor: row-resize; }
    .section-split::after { content: ""; position: absolute; top: -1px; left: 0; right: 0; height: 3px; background: transparent; transition: background .12s ease; }
    .section-split:hover::after, .section-split:focus-visible::after, .section-split[active]::after { background: var(--pi-accent); opacity: .72; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
  `];
}

export function shouldShowMachinesSection(machines: readonly Machine[]): boolean {
  return machines.length > 1;
}

function previousVisibleNavigationTarget(section: NavigationSection, machines: readonly Machine[]): NavigationSection | undefined {
  const sections = visibleNavigationSections(machines);
  return sections[sections.indexOf(section) - 1];
}

function nextVisibleNavigationTarget(section: NavigationSection, machines: readonly Machine[]): NavigationFocusTarget {
  const sections = visibleNavigationSections(machines);
  return sections[sections.indexOf(section) + 1] ?? "chat";
}

// Only a machine choice makes the machines section navigable: with a single
// machine the switcher is a static bubble, and compact mode has no list.
function visibleNavigationSections(machines: readonly Machine[]): NavigationSection[] {
  return NAVIGATION_SECTION_ORDER.filter((section) => section !== "machines" || shouldShowMachinesSection(machines));
}
