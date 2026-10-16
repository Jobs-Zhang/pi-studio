import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** SSH connection details for one machine, mirroring the stored `connection.ssh` shape. */
export interface SshConnectionSpec {
  host: string;
  port?: number;
  user?: string;
  identityFile?: string;
  password?: string;
}

/** The forwarded destination, derived from the machine's `baseUrl`. */
export interface SshTunnelTarget {
  host: string;
  port: number;
}

export type SshTunnelState = "connecting" | "up" | "failed";

export interface SshTunnelStatus {
  state: SshTunnelState;
  localPort?: number;
  error?: string;
}

export interface SshTunnelHandle {
  localPort: number;
}

/**
 * The slice of a spawned ssh child process the tunnel manager depends on.
 * Narrow on purpose: production wraps node:child_process.spawn, and tests
 * provide a plain fake without type assertions.
 */
export interface SshTunnelChildProcess {
  readonly killed: boolean;
  kill(): boolean;
  readonly stderr: { onData(listener: (chunk: Buffer) => void): void } | null;
  onExit(listener: (code: number | null) => void): void;
  onError(listener: (error: Error) => void): void;
}

export type SshSpawnCall = (command: string, args: string[], options: SpawnOptions) => SshTunnelChildProcess;

export interface SshTunnelManagerDependencies {
  /** Test seam for spawning ssh; defaults to node:child_process spawn. */
  spawnImpl?: SshSpawnCall;
  /** Test seam for the readiness probe; defaults to a TCP connect to the local listener. */
  connectProbe?: (port: number, timeoutMs: number) => Promise<void>;
  /** Test seam for free-port allocation; defaults to a bind-and-release on 127.0.0.1. */
  allocatePort?: () => Promise<number>;
  /** Test seam for the clock used by reconnect backoff. */
  now?: () => number;
  /** Test seam for the askpass script directory; defaults to the os tmpdir. */
  tempDir?: () => Promise<string>;
  probeTimeoutMs?: number;
  backoffMs?: number;
  logger?: { error: (message: string) => void };
}

const DEFAULT_PROBE_TIMEOUT_MS = 10_000;
const PROBE_RETRY_INTERVAL_MS = 100;
const DEFAULT_BACKOFF_MS = 5_000;
const STDERR_TAIL_LINES = 50;
const STDERR_SUMMARY_LINES = 5;
// Owner-only but executable: ssh runs the script to obtain the password, so a
// missing execute bit makes every password authentication fail.
const ASKPASS_SCRIPT_MODE = 0o700;

interface TunnelRecord {
  localPort: number;
  child: SshTunnelChildProcess;
  state: "connecting" | "up";
  stderrTail: string[];
  askpassCleanup?: () => Promise<void>;
}

interface TunnelFailure {
  at: number;
  error: string;
}

/**
 * Owns the lifecycle of `ssh -N -L` child processes that forward a local port to
 * each SSH machine's remote PI WEB instance. Tunnels are created lazily by
 * `ensure()`, probed for readiness, and torn down on child exit or `close()`.
 * A per-machine backoff window prevents spawn loops against unreachable hosts.
 */
export class SshTunnelManager {
  private readonly tunnels = new Map<string, TunnelRecord>();
  private readonly starting = new Map<string, Promise<SshTunnelHandle>>();
  private readonly failures = new Map<string, TunnelFailure>();
  private readonly spawnImpl: SshSpawnCall;
  private readonly connectProbeImpl: (port: number, timeoutMs: number) => Promise<void>;
  private readonly allocatePortImpl: () => Promise<number>;
  private readonly now: () => number;
  private readonly probeTimeoutMs: number;
  private readonly backoffMs: number;
  private readonly logger: { error: (message: string) => void } | undefined;
  private readonly askpassDir: (() => Promise<string>) | undefined;
  /** Set by `close()` and `closeMachine()` so in-flight probes abort promptly. */
  private readonly shutdownReasons = new Map<string, string>();
  private readonly pendingRejects = new Map<string, (reason: Error) => void>();
  private globalShutdownReason: string | undefined;

  constructor(deps: SshTunnelManagerDependencies = {}) {
    this.spawnImpl = deps.spawnImpl ?? defaultSpawnSsh;
    this.connectProbeImpl = deps.connectProbe ?? probeLocalListener;
    this.allocatePortImpl = deps.allocatePort ?? allocateFreePort;
    this.now = deps.now ?? (() => Date.now());
    this.probeTimeoutMs = deps.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.backoffMs = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.logger = deps.logger;
    this.askpassDir = deps.tempDir;
  }

  status(machineId: string): SshTunnelStatus | undefined {
    const tunnel = this.tunnels.get(machineId);
    if (tunnel !== undefined) return { state: tunnel.state, localPort: tunnel.localPort };
    const failure = this.failures.get(machineId);
    if (failure !== undefined) return { state: "failed", error: failure.error };
    return undefined;
  }

  async ensure(machineId: string, spec: SshConnectionSpec, target: SshTunnelTarget): Promise<SshTunnelHandle> {
    const globalReason = this.globalShutdownReason;
    if (globalReason !== undefined) throw new Error(globalReason);
    const machineReason = this.shutdownReasons.get(machineId);
    if (machineReason !== undefined) throw new Error(machineReason);
    const starting = this.starting.get(machineId);
    if (starting !== undefined) return starting;

    const tunnel = this.tunnels.get(machineId);
    if (tunnel?.state === "up") return { localPort: tunnel.localPort };

    const failure = this.failures.get(machineId);
    if (failure !== undefined && this.now() < failure.at + this.backoffMs) throw new Error(failure.error);
    this.failures.delete(machineId);

    const attempt = this.startTunnel(machineId, spec, target).finally(() => this.starting.delete(machineId));
    this.starting.set(machineId, attempt);
    return attempt;
  }

  /** Tears down a single machine tunnel. Called by MachineService when a machine is updated or removed. */
  async closeMachine(machineId: string): Promise<void> {
    const reason = `tunnel closed for machine ${machineId}`;
    this.shutdownReasons.set(machineId, reason);
    this.failures.delete(machineId);
    const tunnel = this.tunnels.get(machineId);
    this.tunnels.delete(machineId);
    if (tunnel !== undefined) {
      if (!tunnel.child.killed) tunnel.child.kill();
      await tunnel.askpassCleanup?.();
    }
    // Reject any in-flight ensure() so it doesn't hang until the probe timeout.
    const reject = this.pendingRejects.get(machineId);
    if (reject !== undefined) {
      reject(new Error(reason));
      this.pendingRejects.delete(machineId);
    }
    this.shutdownReasons.delete(machineId);
  }

  async close(): Promise<void> {
    this.globalShutdownReason = "SSH tunnel manager is closed";
    const tunnels = [...this.tunnels.values()];
    this.tunnels.clear();
    this.starting.clear();
    for (const tunnel of tunnels) {
      if (!tunnel.child.killed) tunnel.child.kill();
      await tunnel.askpassCleanup?.();
    }
    // Reject all in-flight ensures so server shutdown does not block on probe timeouts.
    for (const reject of this.pendingRejects.values()) {
      reject(new Error("SSH tunnel manager is closed"));
    }
    this.pendingRejects.clear();
  }

  private async startTunnel(machineId: string, spec: SshConnectionSpec, target: SshTunnelTarget): Promise<SshTunnelHandle> {
    const localPort = await this.allocatePortImpl();
    const args = buildSshTunnelArgs(localPort, spec, target);

    let askpassCleanup: (() => Promise<void>) | undefined;
    let env: NodeJS.ProcessEnv | undefined;
    if (spec.password !== undefined) {
      const askpass = await this.createAskpassScript();
      askpassCleanup = askpass.cleanup;
      // Only pass the env vars ssh actually needs plus our askpass integration.
      // process.env is deliberately not inherited to limit the blast radius of
      // the child seeing server secrets (database URLs, API keys, etc.).
      env = {
        HOME: process.env["HOME"],
        USER: process.env["USER"],
        LOGNAME: process.env["LOGNAME"],
        PATH: process.env["PATH"],
        LANG: process.env["LANG"],
        LC_ALL: process.env["LC_ALL"],
        SSH_AUTH_SOCK: process.env["SSH_AUTH_SOCK"],
        SSH_AGENT_PID: process.env["SSH_AGENT_PID"],
        SSH_ASKPASS: askpass.scriptPath,
        SSH_ASKPASS_REQUIRE: "force",
        DISPLAY: ":",
        PI_WEB_TUNNEL_PASSWORD: spec.password,
      };
    }

    const child = this.spawnImpl("ssh", args, { ...(env === undefined ? {} : { env }), stdio: ["ignore", "ignore", "pipe"] });
    const stderrTail: string[] = [];
    const record: TunnelRecord = { localPort, child, state: "connecting", stderrTail, ...(askpassCleanup === undefined ? {} : { askpassCleanup }) };
    this.tunnels.set(machineId, record);

    child.stderr?.onData((chunk) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/u)) {
        if (line.trim() === "") continue;
        stderrTail.push(line);
        if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift();
      }
    });

    // The readiness probe races child failure: a rejected ssh process (auth
    // failure, dead host) never opens the local listener, so the probe would
    // otherwise hang until its own timeout.
    let rejectChildFailure!: (reason: Error) => void;
    const childFailure = new Promise<never>((_resolve, reject) => {
      rejectChildFailure = reject;
    });
    // Keep a late rejection (child dying after the tunnel came up) from becoming
    // an unhandled rejection; callers observe it through status() instead.
    void childFailure.catch(() => undefined);
    this.pendingRejects.set(machineId, rejectChildFailure);

    const onChildFailure = (reason: string): void => {
      if (this.tunnels.get(machineId) !== record) return;
      const detail = stderrSummary(record, reason);
      this.tunnels.delete(machineId);
      this.failures.set(machineId, { at: this.now(), error: detail });
      void record.askpassCleanup?.();
      rejectChildFailure(new Error(detail));
    };
    child.onExit((code) => { onChildFailure(`ssh exited with code ${code === null ? "unknown" : String(code)}`); });
    child.onError((error) => { onChildFailure(errorMessage(error)); });

    try {
      await Promise.race([this.connectProbeImpl(localPort, this.probeTimeoutMs), childFailure]);
    } catch (error) {
      const message = errorMessage(error);
      const reason = stderrSummary(record, "") === "" ? `SSH tunnel did not become ready: ${message}` : stderrSummary(record, "");
      this.logger?.error(`SSH tunnel to ${sshTargetLabel(spec)} for machine ${machineId} failed: ${reason}`);
      if (!child.killed) child.kill();
      onChildFailure(reason);
      await record.askpassCleanup?.();
      throw new Error(reason, { cause: error });
    }

    if (this.tunnels.get(machineId) === record) record.state = "up";
    return { localPort };
  }

  private async createAskpassScript(): Promise<{ scriptPath: string; cleanup: () => Promise<void> }> {
    const dir = await (this.askpassDir?.() ?? defaultAskpassDir());
    await mkdir(dir, { recursive: true });
    const scriptPath = join(dir, `pi-web-askpass-${randomUUID()}.sh`);
    // The password travels via PI_WEB_TUNNEL_PASSWORD so the script needs no
    // escaping; owner-only permissions keep the harness private for its short
    // lifetime, and the execute bit (see ASKPASS_SCRIPT_MODE) lets ssh run it.
    await writeFile(scriptPath, '#!/bin/sh\nprintf \'%s\\n\' "$PI_WEB_TUNNEL_PASSWORD"\n', { mode: ASKPASS_SCRIPT_MODE });
    return { scriptPath, cleanup: async () => { await rm(scriptPath, { force: true }); } };
  }
}

function defaultSpawnSsh(command: string, args: string[], options: SpawnOptions): SshTunnelChildProcess {
  const child = spawn(command, args, options);
  const stderr = child.stderr;
  return {
    get killed() { return child.killed; },
    kill: () => child.kill(),
    stderr: stderr === null ? null : { onData: (listener) => { stderr.on("data", listener); } },
    onExit: (listener) => { child.once("exit", listener); },
    onError: (listener) => { child.once("error", listener); },
  };
}

async function defaultAskpassDir(): Promise<string> {
  const dir = join(tmpdir(), "pi-web-ssh-askpass");
  await mkdir(dir, { recursive: true });
  return dir;
}

function sshTargetLabel(spec: SshConnectionSpec): string {
  const port = spec.port === undefined ? "" : `:${String(spec.port)}`;
  return `${spec.user === undefined ? "" : `${spec.user}@`}${spec.host}${port}`;
}

function stderrSummary(record: TunnelRecord, fallback: string): string {
  const summary = record.stderrTail.slice(-STDERR_SUMMARY_LINES).join("\n").trim();
  return summary === "" ? fallback : summary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds the ssh command line for a local forward. Exported as the single source
 * of the option contract: ExitOnForwardFailure turns a port clash into a loud
 * exit, ServerAlive* detects dead connections, and accept-new keeps first-connect
 * host key confirmation non-interactive while still rejecting changed keys.
 */
export function buildSshTunnelArgs(localPort: number, spec: SshConnectionSpec, target: SshTunnelTarget): string[] {
  return [
    "-N",
    "-L", `127.0.0.1:${String(localPort)}:${formatTargetHost(target.host)}:${String(target.port)}`,
    ...(spec.port === undefined ? [] : ["-p", String(spec.port)]),
    ...(spec.user === undefined ? [] : ["-l", spec.user]),
    ...(spec.identityFile === undefined ? [] : ["-i", spec.identityFile]),
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    spec.host,
  ];
}

function formatTargetHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

async function allocateFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local tunnel port"));
        return;
      }
      const port = address.port;
      server.close(() => { resolve(port); });
    });
  });
}

/**
 * ssh opens the local -L listener only after authentication succeeds, so a
 * successful TCP connect proves both. Until then every connect is refused, so
 * the probe retries until the deadline instead of failing on the first
 * ECONNREFUSED. Each socket is destroyed immediately.
 */
export function probeLocalListener(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const attempt = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      let settled = false;
      const settle = (error?: Error): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error === undefined) resolve();
        else reject(error);
      };
      socket.once("connect", () => { settle(); });
      socket.once("error", (error: Error) => { settle(error); });
      socket.setTimeout(Math.min(1000, Math.max(1, deadline - Date.now())), () => { settle(new Error("tunnel readiness probe attempt timed out")); });
    });

  return retryUntilReady(attempt, deadline, timeoutMs);
}

async function retryUntilReady(attempt: () => Promise<void>, deadline: number, timeoutMs: number): Promise<void> {
  let lastError = new Error(`tunnel readiness probe timed out after ${String(timeoutMs)}ms`);
  while (Date.now() < deadline) {
    try {
      await attempt();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise<void>((resolve) => { setTimeout(resolve, PROBE_RETRY_INTERVAL_MS); });
    }
  }
  throw lastError;
}
