import type { PendingAskUser, PendingExtensionDialog, SessionActivity, SessionStatus } from "../../shared/apiTypes";
import type { ChatLine, ChatPart } from "./components/shared";
import type { BrowserRealtimeEvent } from "./sessionSocket";

/**
 * Desktop (OS-level) notifications for signals that need the user's attention:
 * an open `ask_user` question, an extension dialog waiting for confirmation,
 * a finished run, and a run that failed and stopped. Transient failures during
 * a run (tool errors) are not notified; the user is alerted when the run
 * actually stops, successfully or not.
 *
 * The mapping is a pure function of the global realtime stream; everything with
 * a side effect (the `Notification` constructor, permissions, persistence, and
 * navigation) is injected so the logic stays testable without a browser.
 */

/** Persisted opt-in. Off until the user explicitly enables notifications. */
export interface DesktopNotificationPreferences {
  enabled: boolean;
}

const storageKey = "pi-web:desktop-notifications";

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function loadDesktopNotificationPreferences(storage: Pick<Storage, "getItem"> | undefined = browserStorage()): DesktopNotificationPreferences {
  try {
    const value: unknown = JSON.parse(storage?.getItem(storageKey) ?? "null");
    if (typeof value === "object" && value !== null && "enabled" in value) return { enabled: value.enabled === true };
  } catch {
    // Notifications are optional when storage is blocked or malformed.
  }
  return { enabled: false };
}

export function saveDesktopNotificationPreferences(
  preferences: DesktopNotificationPreferences,
  storage: Pick<Storage, "setItem"> | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Ignore quota/privacy errors for this optional browser preference.
  }
}

export type DesktopNotificationPermission = "unsupported" | NotificationPermission;

/**
 * Current permission according to the environment, without prompting.
 *
 * Do not use this as a delivery gate: at least one shell (Electron over a
 * plain HTTP gateway) keeps reporting "denied" here even after a granted
 * `requestPermission()`, and its notifications work regardless. Trust the
 * answer of an explicit probe instead.
 */
export function desktopNotificationPermission(): DesktopNotificationPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.requestPermission();
}

/**
 * One OS notification, deduplicated by `dedupeKey` (defaulting to `tag`).
 *
 * `tag` is the browser display identity: notifications that share a tag
 * replace each other on screen. Attention signals that recur per session
 * (a new `ask_user` round replacing the previous one) therefore use a
 * session-scoped `tag` plus a unique `dedupeKey`, so each occurrence is
 * delivered while the screen keeps at most one per session.
 */
export interface DesktopNotification {
  /** Stable display identity; notifications sharing it replace each other. */
  tag: string;
  /** Delivery identity used for dedupe; defaults to `tag`. */
  dedupeKey?: string;
  title: string;
  body: string;
  machineId: string;
  sessionId?: string;
}

export interface DesktopNotificationEventOptions {
  /** Human label for the session, when the browser already knows one. */
  sessionLabel?: string | undefined;
  /**
   * Best-effort opening text of the session's last assistant message, for the
   * settled-run notification. Background sessions only have it when their
   * transcript is still cached locally; without it the generic body is used.
   */
  lastAssistantMessage?: string | undefined;
}

/** Cap on remembered dedupe tags, so a long session cannot grow memory without bound. */
export const DESKTOP_NOTIFICATION_TAG_LIMIT = 256;

/** Longest body kept from a model-authored question or dialog, in characters. */
export const DESKTOP_NOTIFICATION_BODY_LIMIT = 220;

/** Longest session label kept in a notification title, in characters. */
export const DESKTOP_NOTIFICATION_SUBJECT_LIMIT = 48;

/**
 * Map one global realtime event to the notification it should raise, if any.
 * Returns `undefined` for the many events that are not user-attention signals.
 */
export function desktopNotificationForEvent(
  machineId: string,
  event: BrowserRealtimeEvent,
  options: DesktopNotificationEventOptions = {},
): DesktopNotification | undefined {
  const subject = subjectLabel(options);
  if (event.type === "session.ask.opened") {
    return {
      // Session-scoped tag: the next ask round for this session replaces this
      // notification on screen instead of stacking a second one.
      tag: `${machineId}:ask:${event.sessionId}`,
      dedupeKey: `${machineId}:ask:${event.ask.askId}`,
      title: `${subject} needs your answer`,
      body: askBody(event.ask),
      machineId,
      sessionId: event.sessionId,
    };
  }
  if (event.type === "session.dialog.opened") {
    return {
      tag: `${machineId}:dialog:${event.sessionId}`,
      dedupeKey: `${machineId}:dialog:${event.dialog.dialogId}`,
      title: `${subject} needs your ${event.dialog.kind === "confirm" ? "confirmation" : "input"}`,
      body: dialogBody(event.dialog),
      machineId,
      sessionId: event.sessionId,
    };
  }
  if (event.type === "activity.update") return runFailureNotification(machineId, event.activity, subject);
  return undefined;
}

/**
 * A run that settled because it failed (for example `Model response failed:
 * Connection error.`) stops the agent, so the user must intervene — the
 * notification carries the failure message.
 *
 * Only the run-level failure notifies (`label === "error"`, published when the
 * prompt run rejects). Tool and feature-level failures (`bash complete`,
 * `bash failed`, `compaction failed`, …) stay silent: the agent handles them
 * and keeps working.
 */
function runFailureNotification(machineId: string, activity: SessionActivity, subject: string): DesktopNotification | undefined {
  if (activity.phase !== "error" || activity.label !== "error") return undefined;
  const detail = activity.detail ?? "The agent run failed and stopped.";
  return {
    // Session-scoped tag shared with the settled-run notification (see
    // {@link sessionRunCompletionNotification}): the failure replaces the
    // completion toast when it trails the settle edge.
    tag: `${machineId}:settled:${activity.sessionId}`,
    dedupeKey: `${machineId}:run-failed:${activity.sessionId}:${activity.at}`,
    title: `${subject} run failed`,
    body: truncate(detail, DESKTOP_NOTIFICATION_BODY_LIMIT),
    machineId,
    sessionId: activity.sessionId,
  };
}

/** A machine that stopped answering health checks, reported once per outage. */
export function machineUnavailableNotification(machineId: string, machineName: string): DesktopNotification {
  return {
    tag: `${machineId}:machine-unavailable`,
    title: "PI WEB machine unavailable",
    body: `${machineName} is not responding. Sessions on it keep running; only this browser lost contact.`,
    machineId,
  };
}

/**
 * The notification for a run that settled: the session status flipped
 * `isStreaming` from true to false.
 *
 * Completion is read from that transition rather than an activity label because
 * the daemon publishes `turn complete` on every assistant turn (each tool round
 * is one turn), while `isStreaming` stays true for the whole run and flips once
 * when it settles. `runId` is a per-session counter so successive runs in one
 * page load stay distinct in the dedupe set.
 *
 * A run that settled because it is waiting on the user (an open `ask_user`
 * question set or extension dialog) does not notify: the ask/dialog signal
 * already raised the attention notification for that same stop.
 */
export function sessionRunCompletionNotification(
  machineId: string,
  sessionId: string,
  runId: number,
  options: DesktopNotificationEventOptions = {},
): DesktopNotification {
  return {
    // Session-scoped tag shared with the run-failure notification: whichever
    // signal arrives second (failure detail typically trails the settle edge)
    // replaces the other on screen, so one stop shows one notification.
    tag: `${machineId}:settled:${sessionId}`,
    dedupeKey: `${machineId}:settled:${sessionId}:${String(runId)}`,
    title: `${subjectLabel(options)} finished working`,
    body: options.lastAssistantMessage === undefined
      ? "The agent completed its turn and is waiting for you."
      : truncate(options.lastAssistantMessage, DESKTOP_NOTIFICATION_BODY_LIMIT),
    machineId,
    sessionId,
  };
}

/**
 * Opening text of the last assistant message in a transcript, for the
 * settled-run notification body. Returns `undefined` when the transcript has
 * no assistant text (never streamed here, or the message is empty).
 */
export function lastAssistantTranscriptSummary(messages: readonly ChatLine[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const line = messages[index];
    if (line?.role !== "assistant") continue;
    const textPart = line.parts.find((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text");
    const collapsed = (textPart?.displayText ?? textPart?.text)?.replace(/\s+/gu, " ").trim() ?? "";
    if (collapsed === "") continue;
    return collapsed;
  }
  return undefined;
}

/**
 * True when a settled run stopped because it is waiting on the user (an open
 * `ask_user` question set or extension dialog) rather than finishing its work.
 */
export function sessionSettledWaitingForUser(status: SessionStatus): boolean {
  return status.pendingAsk !== undefined || (status.pendingDialogs?.length ?? 0) > 0;
}

export interface SessionOnScreenContext {
  machineId: string | undefined;
  sessionId: string | undefined;
  /** True while the window is visible and focused, i.e. the user is reading this session already. */
  windowPresenting: boolean;
}

/**
 * A toast naming a session the window already shows would only repeat the
 * screen. A hidden or unfocused window shows nothing, so its sessions still notify.
 */
export function isSessionAlreadyOnScreen(notification: DesktopNotification, context: SessionOnScreenContext): boolean {
  return context.windowPresenting
    && notification.sessionId !== undefined
    && notification.sessionId === context.sessionId
    && notification.machineId === context.machineId;
}

function subjectLabel(options: DesktopNotificationEventOptions): string {
  return truncate(options.sessionLabel ?? "Agent", DESKTOP_NOTIFICATION_SUBJECT_LIMIT);
}

function askBody(ask: PendingAskUser): string {
  const first = ask.questions[0];
  if (first === undefined) return "The agent is waiting for an answer.";
  const extra = ask.questions.length > 1 ? ` (+${String(ask.questions.length - 1)} more)` : "";
  return truncate(`${first.question}${extra}`, DESKTOP_NOTIFICATION_BODY_LIMIT);
}

function dialogBody(dialog: PendingExtensionDialog): string {
  return truncate(dialog.message ?? dialog.title, DESKTOP_NOTIFICATION_BODY_LIMIT);
}

/** Collapses whitespace and shortens to `limit` characters, ending in an ellipsis when cut. */
function truncate(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/gu, " ").trim();
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, Math.max(1, limit - 1))}…`;
}

/** The browser boundary that raises the OS notification. */
export interface DesktopNotificationSink {
  permission(): DesktopNotificationPermission;
  requestPermission(): Promise<DesktopNotificationPermission>;
  show(notification: DesktopNotification, onActivate: () => void): void;
}

/** `Notification`-backed sink. Notifications without a body still render a title. */
export function browserNotificationSink(): DesktopNotificationSink {
  return {
    permission: desktopNotificationPermission,
    requestPermission: requestDesktopNotificationPermission,
    show: (notification, onActivate) => {
      if (typeof Notification === "undefined") return;
      const shown = new Notification(notification.title, {
        body: notification.body,
        tag: notification.tag,
      });
      shown.onclick = () => {
        onActivate();
        shown.close();
      };
    },
  };
}

export interface DesktopNotificationActivation {
  machineId: string;
  sessionId?: string;
}

export interface DesktopNotificationCenterOptions {
  sink?: DesktopNotificationSink;
  loadPreferences?: () => DesktopNotificationPreferences;
  savePreferences?: (preferences: DesktopNotificationPreferences) => void;
  /** Bring the app to the foreground and, when known, the originating session. */
  onActivate?: (activation: DesktopNotificationActivation) => void;
  /** Return true to keep a signal out of the OS notification center (for example, the open session is already focused). */
  shouldSuppress?: (notification: DesktopNotification) => boolean;
  tagLimit?: number;
}

/**
 * Owns the notification opt-in, the permission probe, the dedupe set, and the
 * sink. Permission comes from explicit `requestPermission()` answers (the
 * user's opt-in or `revalidate()`), never from re-reading the environment's
 * permission getter at delivery time; see `desktopNotificationPermission`.
 *
 * Dedupe is deliberately permanent for the lifetime of the page: realtime
 * broadcasts are not replayed across a reconnect, so a repeated tag always
 * means a duplicate delivery of the same signal rather than a new occurrence.
 */
export class DesktopNotificationCenter {
  private readonly sink: DesktopNotificationSink;
  private readonly loadPreferences: () => DesktopNotificationPreferences;
  private readonly savePreferences: (preferences: DesktopNotificationPreferences) => void;
  private readonly onActivate: ((activation: DesktopNotificationActivation) => void) | undefined;
  private readonly shouldSuppress: ((notification: DesktopNotification) => boolean) | undefined;
  private readonly tagLimit: number;
  private readonly seenTags = new Set<string>();
  /** Per-session run state, so a settled run is detected as an `isStreaming` edge. */
  private readonly sessionRunState = new Map<string, SessionRunState>();
  private enabledState: boolean;
  private permissionState: DesktopNotificationPermission;

  constructor(options: DesktopNotificationCenterOptions = {}) {
    this.sink = options.sink ?? browserNotificationSink();
    this.loadPreferences = options.loadPreferences ?? loadDesktopNotificationPreferences;
    this.savePreferences = options.savePreferences ?? saveDesktopNotificationPreferences;
    this.onActivate = options.onActivate;
    this.shouldSuppress = options.shouldSuppress;
    this.tagLimit = options.tagLimit ?? DESKTOP_NOTIFICATION_TAG_LIMIT;
    this.enabledState = this.loadPreferences().enabled;
    this.permissionState = this.sink.permission();
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  /** Last known permission, from the initial read or the latest explicit probe. */
  get permission(): DesktopNotificationPermission {
    return this.permissionState;
  }

  /** Turn the opt-in on/off, requesting permission when enabling. */
  async setEnabled(enabled: boolean): Promise<DesktopNotificationPermission> {
    if (!enabled) {
      this.enabledState = false;
      this.savePreferences({ enabled: false });
      return this.permission;
    }
    const permission = await this.probePermission();
    this.enabledState = permission === "granted";
    this.savePreferences({ enabled: this.enabledState });
    return permission;
  }

  /**
   * Re-probe permission for an opt-in restored from storage after a page load.
   * The probe answers without a prompt once the environment has decided, so a
   * restored opt-in keeps working and a withdrawn one turns itself off instead
   * of failing silently at delivery time.
   */
  async revalidate(): Promise<void> {
    if (!this.enabledState) return;
    if (await this.probePermission() === "granted") return;
    this.enabledState = false;
    this.savePreferences({ enabled: false });
    console.warn("System notifications are unavailable in this context; the opt-in was turned off.");
  }

  private async probePermission(): Promise<DesktopNotificationPermission> {
    try {
      const permission = await this.sink.requestPermission();
      this.permissionState = permission;
      return permission;
    } catch (error) {
      console.warn("Failed to request system notification permission", error);
      return this.permissionState;
    }
  }

  /**
   * Raise a notification for one realtime event, if it is an attention signal
   * that has not already been shown.
   */
  handleEvent(machineId: string, event: BrowserRealtimeEvent, options: DesktopNotificationEventOptions = {}): boolean {
    if (event.type === "status.update") return this.handleSessionStatus(machineId, event.status, options);
    const notification = desktopNotificationForEvent(machineId, event, options);
    return notification !== undefined && this.notify(notification);
  }

  /**
   * Notifies on the settled-run edge: `isStreaming` was true and is now false.
   * The daemon republishes status on every event, so only the edge notifies; a
   * run that was never observed streaming (page loaded while idle) stays silent.
   */
  private handleSessionStatus(machineId: string, status: SessionStatus, options: DesktopNotificationEventOptions): boolean {
    const key = `${machineId}\u0000${status.sessionId}`;
    const previous = this.sessionRunState.get(key);
    const settled = previous?.streaming === true && !status.isStreaming;
    const runs = (previous?.runs ?? 0) + (settled ? 1 : 0);
    this.sessionRunState.set(key, { streaming: status.isStreaming, runs });
    if (!settled || sessionSettledWaitingForUser(status)) return false;
    return this.notify(sessionRunCompletionNotification(machineId, status.sessionId, runs, options));
  }

  /** Raise a notification for a direct signal that is not part of the realtime stream. */
  notify(notification: DesktopNotification): boolean {
    if (!this.enabledState) return false;
    const dedupeKey = notification.dedupeKey ?? notification.tag;
    if (this.seenTags.has(dedupeKey)) return false;
    this.rememberTag(dedupeKey);
    if (this.shouldSuppress?.(notification) === true) return false;
    try {
      this.sink.show(notification, () => { this.onActivate?.(activationFor(notification)); });
    } catch (error) {
      // Permission can be withdrawn behind the page's back; keep the event flow alive and make it visible.
      console.warn("Failed to show system notification", error);
      return false;
    }
    return true;
  }

  /** Forget dedupe state; used when the app drops its realtime connections. */
  reset(): void {
    this.seenTags.clear();
  }

  private rememberTag(tag: string): void {
    this.seenTags.add(tag);
    while (this.seenTags.size > this.tagLimit) {
      const oldest = this.seenTags.values().next();
      if (oldest.done === true) return;
      this.seenTags.delete(oldest.value);
    }
  }
}

interface SessionRunState {
  streaming: boolean;
  /** Settled-run counter, so successive runs get distinct completion tags. */
  runs: number;
}

function activationFor(notification: DesktopNotification): DesktopNotificationActivation {
  return notification.sessionId === undefined
    ? { machineId: notification.machineId }
    : { machineId: notification.machineId, sessionId: notification.sessionId };
}
