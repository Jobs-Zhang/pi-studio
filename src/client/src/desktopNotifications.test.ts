import { describe, expect, it, vi } from "vitest";
import type { PendingAskUser, PendingExtensionDialog, SessionActivity } from "../../shared/apiTypes";
import type { BrowserRealtimeEvent } from "./sessionSocket";
import {
  DESKTOP_NOTIFICATION_BODY_LIMIT,
  DESKTOP_NOTIFICATION_SUBJECT_LIMIT,
  DesktopNotificationCenter,
  desktopNotificationForEvent,
  desktopNotificationsSupported,
  isSessionAlreadyOnScreen,
  loadDesktopNotificationPreferences,
  machineUnavailableNotification,
  saveDesktopNotificationPreferences,
  sessionRunCompletionNotification,
  type DesktopNotification,
  type DesktopNotificationPermission,
  type DesktopNotificationSink,
} from "./desktopNotifications";

function ask(overrides: Partial<PendingAskUser> = {}): PendingAskUser {
  return {
    askId: "ask-1",
    askedAt: "2026-01-01T00:00:00.000Z",
    questions: [{ id: "q1", question: "Which database should I use?", options: [] }],
    ...overrides,
  };
}

function dialog(overrides: Partial<PendingExtensionDialog> = {}): PendingExtensionDialog {
  return {
    dialogId: "dialog-1",
    kind: "confirm",
    title: "Allow the deploy command?",
    askedAt: "2026-01-01T00:00:00.000Z",
    runScoped: false,
    ...overrides,
  };
}

function activity(overrides: Partial<SessionActivity> = {}): SessionActivity {
  return { sessionId: "session-1", phase: "idle", label: "message complete", at: "2026-01-01T00:00:00.000Z", ...overrides };
}

function status(sessionId: string, isStreaming: boolean): BrowserRealtimeEvent {
  return {
    type: "status.update",
    status: { sessionId, isStreaming, isCompacting: false, isBashRunning: false, pendingMessageCount: 0, queuedMessages: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0 },
  };
}

interface FakeSink extends DesktopNotificationSink {
  readonly shown: DesktopNotification[];
  activateLatest(): void;
  setPermission(permission: DesktopNotificationPermission): void;
  /** Answer of later permission probes, when it must differ from `permission()`. */
  setRequestResult(permission: DesktopNotificationPermission): void;
}

function fakeSink(permission: DesktopNotificationPermission = "granted"): FakeSink {
  let current = permission;
  let requestResult: DesktopNotificationPermission | undefined;
  const shown: DesktopNotification[] = [];
  let latest: (() => void) | undefined;
  return {
    shown,
    permission: () => current,
    setPermission: (next) => { current = next; },
    setRequestResult: (next) => { requestResult = next; },
    requestPermission: () => Promise.resolve(requestResult ?? current),
    show: (notification, onActivate) => {
      shown.push(notification);
      latest = onActivate;
    },
    activateLatest: () => { latest?.(); },
  };
}

describe("desktopNotificationForEvent", () => {
  it("maps an open ask to a deduplicated notification about the first question", () => {
    const event: BrowserRealtimeEvent = { type: "session.ask.opened", sessionId: "session-1", ask: ask() };

    expect(desktopNotificationForEvent("local", event)).toEqual({
      tag: "local:ask:ask-1",
      title: "Agent needs your answer",
      body: "Which database should I use?",
      machineId: "local",
      sessionId: "session-1",
    });
  });

  it("names the remaining questions when an ask has several", () => {
    const event: BrowserRealtimeEvent = {
      type: "session.ask.opened",
      sessionId: "session-1",
      ask: ask({ questions: [{ id: "q1", question: "First?", options: [] }, { id: "q2", question: "Second?", options: [] }] }),
    };

    expect(desktopNotificationForEvent("local", event)?.body).toBe("First? (+1 more)");
  });

  it("uses the session label in the title when one is known", () => {
    const event: BrowserRealtimeEvent = { type: "session.ask.opened", sessionId: "session-1", ask: ask() };

    expect(desktopNotificationForEvent("local", event, { sessionLabel: "Auth refactor" })?.title).toBe("Auth refactor needs your answer");
  });

  it("distinguishes a confirm dialog from an input dialog", () => {
    const confirm: BrowserRealtimeEvent = { type: "session.dialog.opened", sessionId: "session-1", dialog: dialog() };
    const input: BrowserRealtimeEvent = {
      type: "session.dialog.opened",
      sessionId: "session-1",
      dialog: dialog({ dialogId: "dialog-2", kind: "input", title: "Branch name" }),
    };

    expect(desktopNotificationForEvent("local", confirm)).toMatchObject({ tag: "local:dialog:dialog-1", title: "Agent needs your confirmation", body: "Allow the deploy command?" });
    expect(desktopNotificationForEvent("local", input)).toMatchObject({ tag: "local:dialog:dialog-2", title: "Agent needs your input", body: "Branch name" });
  });

  it("notifies when a run fails, carrying the activity detail", () => {
    const event: BrowserRealtimeEvent = { type: "activity.update", activity: activity({ phase: "error", label: "tool failed", detail: "bash" }) };

    expect(desktopNotificationForEvent("local", event)).toMatchObject({
      tag: "local:error:session-1:2026-01-01T00:00:00.000Z",
      title: "Agent reported an error",
      body: "tool failed (bash)",
    });
  });

  it("ignores progress activity and unrelated global events", () => {
    const working: BrowserRealtimeEvent = { type: "activity.update", activity: activity({ phase: "active", label: "agent running" }) };
    const otherIdle: BrowserRealtimeEvent = { type: "activity.update", activity: activity({ label: "message complete" }) };
    // `turn complete` is emitted on every assistant turn, not once per run, so it must not notify here.
    const turnComplete: BrowserRealtimeEvent = { type: "activity.update", activity: activity({ label: "turn complete" }) };
    const unrelated: BrowserRealtimeEvent = { type: "models.changed", revision: 3 };

    expect(desktopNotificationForEvent("local", working)).toBeUndefined();
    expect(desktopNotificationForEvent("local", otherIdle)).toBeUndefined();
    expect(desktopNotificationForEvent("local", turnComplete)).toBeUndefined();
    expect(desktopNotificationForEvent("local", unrelated)).toBeUndefined();
  });

  it("collapses whitespace and truncates long model-authored bodies", () => {
    const event: BrowserRealtimeEvent = {
      type: "session.ask.opened",
      sessionId: "session-1",
      ask: ask({ questions: [{ id: "q1", question: `${"word ".repeat(80)}end`, options: [] }] }),
    };

    const body = desktopNotificationForEvent("local", event)?.body ?? "";
    expect(body.length).toBe(DESKTOP_NOTIFICATION_BODY_LIMIT);
    expect(body.endsWith("…")).toBe(true);
    expect(body.includes("  ")).toBe(false);
  });

  it("shortens an over-long session label in the title", () => {
    const event: BrowserRealtimeEvent = { type: "session.ask.opened", sessionId: "session-1", ask: ask() };

    const title = desktopNotificationForEvent("local", event, { sessionLabel: "x".repeat(200) })?.title ?? "";
    expect(title).toBe(`${"x".repeat(DESKTOP_NOTIFICATION_SUBJECT_LIMIT - 1)}… needs your answer`);
  });
});

describe("sessionRunCompletionNotification", () => {
  it("builds a per-run notification from the session label", () => {
    expect(sessionRunCompletionNotification("local", "session-1", 2, { sessionLabel: "Auth refactor" })).toEqual({
      tag: "local:complete:session-1:2",
      title: "Auth refactor finished working",
      body: "The agent completed its turn and is waiting for you.",
      machineId: "local",
      sessionId: "session-1",
    });
  });
});

describe("machineUnavailableNotification", () => {
  it("reports the machine by name with a stable outage tag", () => {
    expect(machineUnavailableNotification("remote-1", "devbox")).toEqual({
      tag: "remote-1:machine-unavailable",
      title: "PI WEB machine unavailable",
      body: "devbox is not responding. Sessions on it keep running; only this browser lost contact.",
      machineId: "remote-1",
    });
  });
});

describe("isSessionAlreadyOnScreen", () => {
  const notification: DesktopNotification = {
    tag: "local:ask:ask-1",
    title: "Agent needs your answer",
    body: "Which database should I use?",
    machineId: "local",
    sessionId: "session-1",
  };

  it("suppresses only the session the window is presenting", () => {
    const onScreen = { machineId: "local", sessionId: "session-1", windowPresenting: true };

    expect(isSessionAlreadyOnScreen(notification, onScreen)).toBe(true);
    expect(isSessionAlreadyOnScreen(notification, { ...onScreen, sessionId: "session-2" })).toBe(false);
    expect(isSessionAlreadyOnScreen(notification, { ...onScreen, machineId: "remote-1" })).toBe(false);
  });

  it("keeps notifying while the window is hidden or unfocused", () => {
    expect(isSessionAlreadyOnScreen(notification, { machineId: "local", sessionId: "session-1", windowPresenting: false })).toBe(false);
  });

  it("never suppresses a signal without a session", () => {
    expect(isSessionAlreadyOnScreen(machineUnavailableNotification("local", "Local"), { machineId: "local", sessionId: undefined, windowPresenting: true })).toBe(false);
  });
});

describe("DesktopNotificationCenter", () => {
  it("notifies once a run settles and again on the next run", () => {
    const sink = fakeSink();
    const center = enabledCenter(sink);

    expect(center.handleEvent("local", status("session-1", true))).toBe(false);
    expect(center.handleEvent("local", status("session-1", true))).toBe(false);
    expect(center.handleEvent("local", status("session-1", false))).toBe(true);
    expect(center.handleEvent("local", status("session-1", false))).toBe(false);
    expect(center.handleEvent("local", status("session-1", true))).toBe(false);
    expect(center.handleEvent("local", status("session-1", false))).toBe(true);

    expect(sink.shown.map((notification) => notification.tag)).toEqual(["local:complete:session-1:1", "local:complete:session-1:2"]);
  });

  it("stays silent for a session that was already idle when first seen", () => {
    const sink = fakeSink();
    const center = enabledCenter(sink);

    expect(center.handleEvent("local", status("session-1", false))).toBe(false);
    expect(sink.shown).toEqual([]);
  });

  it("does not treat an intermediate turn completion activity as a finished run", () => {
    const sink = fakeSink();
    const center = enabledCenter(sink);
    const turnComplete: BrowserRealtimeEvent = { type: "activity.update", activity: activity({ label: "turn complete" }) };

    expect(center.handleEvent("local", turnComplete)).toBe(false);
    expect(sink.shown).toEqual([]);
  });

  it("stays silent until the user opts in", () => {
    const sink = fakeSink();
    const center = new DesktopNotificationCenter({ sink, loadPreferences: () => ({ enabled: false }), savePreferences: () => undefined });

    expect(center.enabled).toBe(false);
    expect(center.notify(machineUnavailableNotification("local", "Local"))).toBe(false);
    expect(sink.shown).toEqual([]);
  });

  it("enables only when the permission request is granted and persists the choice", async () => {
    const sink = fakeSink("default");
    const saved: boolean[] = [];
    const center = new DesktopNotificationCenter({ sink, loadPreferences: () => ({ enabled: false }), savePreferences: (preferences) => { saved.push(preferences.enabled); } });

    expect(await center.setEnabled(true)).toBe("default");
    expect(center.enabled).toBe(false);

    sink.setPermission("granted");
    expect(await center.setEnabled(true)).toBe("granted");
    expect(center.enabled).toBe(true);

    await center.setEnabled(false);
    expect(center.enabled).toBe(false);
    expect(saved).toEqual([false, true, false]);
  });

  it("shows each attention signal once per page", () => {
    const sink = fakeSink();
    const center = enabledCenter(sink);
    const event: BrowserRealtimeEvent = { type: "session.ask.opened", sessionId: "session-1", ask: ask() };

    expect(center.handleEvent("local", event)).toBe(true);
    expect(center.handleEvent("local", event)).toBe(false);
    expect(sink.shown).toHaveLength(1);

    center.reset();
    expect(center.handleEvent("local", event)).toBe(true);
    expect(sink.shown).toHaveLength(2);
  });

  it("keeps the same signal distinct across machines", () => {
    const sink = fakeSink();
    const center = enabledCenter(sink);
    const event: BrowserRealtimeEvent = { type: "session.ask.opened", sessionId: "session-1", ask: ask() };

    center.handleEvent("local", event);
    center.handleEvent("remote-1", event);

    expect(sink.shown.map((notification) => notification.machineId)).toEqual(["local", "remote-1"]);
  });

  it("delivers when the permission getter stays denied after a granted probe", async () => {
    // Electron over a plain HTTP gateway: the getter reports "denied" forever,
    // while an explicit probe is granted and notifications do work.
    const sink = fakeSink("denied");
    sink.setRequestResult("granted");
    const center = new DesktopNotificationCenter({ sink, loadPreferences: () => ({ enabled: false }), savePreferences: () => undefined });

    await center.setEnabled(true);

    expect(center.enabled).toBe(true);
    expect(center.notify(machineUnavailableNotification("local", "Local"))).toBe(true);
    expect(sink.shown).toHaveLength(1);
  });

  it("revalidates a persisted opt-in against a fresh permission probe", async () => {
    const sink = fakeSink("denied");
    sink.setRequestResult("granted");
    const kept = new DesktopNotificationCenter({ sink, loadPreferences: () => ({ enabled: true }), savePreferences: () => undefined });

    await kept.revalidate();

    expect(kept.enabled).toBe(true);
    expect(kept.notify(machineUnavailableNotification("local", "Local"))).toBe(true);

    sink.setRequestResult("denied");
    const saved: boolean[] = [];
    const dropped = new DesktopNotificationCenter({ sink, loadPreferences: () => ({ enabled: true }), savePreferences: (preferences) => { saved.push(preferences.enabled); } });

    await dropped.revalidate();

    expect(dropped.enabled).toBe(false);
    expect(dropped.notify(machineUnavailableNotification("local", "Local"))).toBe(false);
    expect(saved).toEqual([false]);
  });

  it("reports a failed show instead of breaking the event flow", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const sink: FakeSink = { ...fakeSink(), show: () => { throw new Error("blocked"); } };
      const center = enabledCenter(sink);

      expect(center.notify(machineUnavailableNotification("local", "Local"))).toBe(false);
      expect(warn).toHaveBeenCalled();
      expect(sink.shown).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it("honours suppression without losing the dedupe claim", () => {
    const sink = fakeSink();
    const center = enabledCenter(sink, { shouldSuppress: (notification) => notification.sessionId === "session-1" });
    const suppressed: BrowserRealtimeEvent = { type: "session.ask.opened", sessionId: "session-1", ask: ask() };
    const allowed: BrowserRealtimeEvent = { type: "session.ask.opened", sessionId: "session-2", ask: ask({ askId: "ask-2" }) };

    expect(center.handleEvent("local", suppressed)).toBe(false);
    expect(center.handleEvent("local", allowed)).toBe(true);
    expect(sink.shown.map((notification) => notification.sessionId)).toEqual(["session-2"]);
  });

  it("reports the originating session when the notification is activated", () => {
    const sink = fakeSink();
    const activated: unknown[] = [];
    const center = enabledCenter(sink, { onActivate: (activation) => { activated.push(activation); } });

    center.handleEvent("remote-1", { type: "session.dialog.opened", sessionId: "session-9", dialog: dialog() });
    sink.activateLatest();

    expect(activated).toEqual([{ machineId: "remote-1", sessionId: "session-9" }]);
  });

  it("drops the oldest dedupe tags once the limit is reached", () => {
    const sink = fakeSink();
    const center = enabledCenter(sink, { tagLimit: 2 });
    const first: DesktopNotification = { ...machineUnavailableNotification("local", "Local"), tag: "first" };
    const second: DesktopNotification = { ...first, tag: "second" };

    expect(center.notify(first)).toBe(true);
    expect(center.notify(second)).toBe(true);
    expect(center.notify({ ...first, tag: "third" })).toBe(true);
    expect(center.notify(first)).toBe(true);
    expect(sink.shown.map((notification) => notification.tag)).toEqual(["first", "second", "third", "first"]);
  });
});

describe("desktop notification preferences", () => {
  it("round-trips the opt-in and tolerates missing or malformed storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };

    expect(loadDesktopNotificationPreferences(storage)).toEqual({ enabled: false });
    saveDesktopNotificationPreferences({ enabled: true }, storage);
    expect(loadDesktopNotificationPreferences(storage)).toEqual({ enabled: true });

    values.set("pi-web:desktop-notifications", "{not json");
    expect(loadDesktopNotificationPreferences(storage)).toEqual({ enabled: false });
  });
});

describe("desktopNotificationsSupported", () => {
  it("reports unsupported when the environment has no Notification constructor", () => {
    expect(desktopNotificationsSupported()).toBe(false);
  });
});

function enabledCenter(sink: FakeSink, options: { onActivate?: (activation: { machineId: string; sessionId?: string }) => void; shouldSuppress?: (notification: DesktopNotification) => boolean; tagLimit?: number } = {}): DesktopNotificationCenter {
  const center = new DesktopNotificationCenter({
    sink,
    loadPreferences: () => ({ enabled: true }),
    savePreferences: () => undefined,
    ...options,
  });
  expect(center.enabled).toBe(true);
  return center;
}
