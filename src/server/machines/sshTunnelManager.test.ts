import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSshTunnelArgs, probeLocalListener, SshTunnelManager, type SshTunnelChildProcess } from "./sshTunnelManager.js";

class FakeSshChild implements SshTunnelChildProcess {
  killed = false;
  readonly spawnargs: string[];
  readonly spawnEnv: NodeJS.ProcessEnv;
  private readonly killHandler: (() => void) | undefined;
  private readonly exitListeners: ((code: number | null) => void)[] = [];
  private readonly errorListeners: ((error: Error) => void)[] = [];
  private readonly stderrListeners: ((chunk: Buffer) => void)[] = [];

  constructor(args: string[], env: NodeJS.ProcessEnv, killHandler?: () => void) {
    this.spawnargs = ["ssh", ...args];
    this.spawnEnv = env;
    this.killHandler = killHandler;
  }

  kill(): boolean {
    if (this.killed) return false;
    this.killed = true;
    this.killHandler?.();
    return true;
  }

  readonly stderr = {
    onData: (listener: (chunk: Buffer) => void): void => {
      this.stderrListeners.push(listener);
    },
  };

  onExit(listener: (code: number | null) => void): void {
    this.exitListeners.push(listener);
  }

  onError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  emitStderr(chunk: string): void {
    for (const listener of [...this.stderrListeners]) listener(Buffer.from(chunk));
  }

  emitExit(code: number | null): void {
    for (const listener of [...this.exitListeners]) listener(code);
  }

  emitError(error: Error): void {
    for (const listener of [...this.errorListeners]) listener(error);
  }
}

interface Harness {
  manager: SshTunnelManager;
  spawns: FakeSshChild[];
  probeQueue: Promise<void>[];
  advanceTime: (ms: number) => void;
  cleanup: () => Promise<void>;
}

const neverSettles: Promise<void> = new Promise<void>(() => undefined);

function createHarness(initialProbeResults: Promise<void>[] = []): Harness {
  const spawns: FakeSshChild[] = [];
  const probeQueue = [...initialProbeResults];
  let clock = 1_000_000;
  const killHandlers: (() => void)[] = [];

  const manager = new SshTunnelManager({
    spawnImpl: (command, args, options) => {
      expect(command).toBe("ssh");
      const child = new FakeSshChild(args, options.env ?? {}, () => { killHandlers.forEach((handler) => { handler(); }); });
      spawns.push(child);
      return child;
    },
    connectProbe: (port: number) => {
      expect(port).toBeGreaterThan(0);
      return probeQueue.shift() ?? Promise.resolve();
    },
    allocatePort: () => Promise.resolve(47123),
    now: () => clock,
    tempDir: () => Promise.resolve(join(tmpdir(), `pi-web-tunnel-test-${String(spawns.length)}`)),
  });

  return {
    manager,
    spawns,
    probeQueue,
    advanceTime: (ms: number) => {
      clock += ms;
    },
    cleanup: async () => {
      await manager.close();
      for (const handler of killHandlers) {
        handler();
      }
    },
  };
}

function spawnedChild(spawns: FakeSshChild[], index = 0): FakeSshChild {
  const child = spawns[index];
  if (child === undefined) throw new Error(`Expected ssh child spawn #${String(index)}`);
  return child;
}

const SSH_SPEC = { host: "devbox" };
const TARGET = { host: "127.0.0.1", port: 8505 };

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(async (dir) => { await rm(dir, { recursive: true, force: true }); }));
  tempDirs = [];
});

describe("buildSshTunnelArgs", () => {
  it("builds a local forward with health and safety options", () => {
    expect(buildSshTunnelArgs(41000, { host: "devbox" }, { host: "127.0.0.1", port: 8505 })).toEqual([
      "-N",
      "-L", "127.0.0.1:41000:127.0.0.1:8505",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-o", "StrictHostKeyChecking=accept-new",
      "devbox",
    ]);
  });

  it("maps explicit ssh connection fields to options", () => {
    expect(buildSshTunnelArgs(41001, { host: "box", port: 2222, user: "jobs", identityFile: "/keys/id_ed25519" }, TARGET)).toEqual([
      "-N",
      "-L", "127.0.0.1:41001:127.0.0.1:8505",
      "-p", "2222",
      "-l", "jobs",
      "-i", "/keys/id_ed25519",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-o", "StrictHostKeyChecking=accept-new",
      "box",
    ]);
  });

  it("brackets IPv6 forward targets", () => {
    const args = buildSshTunnelArgs(41002, { host: "v6box" }, { host: "::1", port: 8505 });
    expect(args[2]).toBe("127.0.0.1:41002:[::1]:8505");
  });
});

describe("SshTunnelManager", () => {
  it("spawns ssh once, resolves after the probe succeeds, and reuses the tunnel", async () => {
    const harness = createHarness();

    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).resolves.toEqual({ localPort: 47123 });
    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).resolves.toEqual({ localPort: 47123 });

    expect(harness.spawns).toHaveLength(1);
    expect(spawnedChild(harness.spawns).spawnargs.slice(0, 3)).toEqual(["ssh", "-N", "-L"]);
    expect(harness.manager.status("m1")).toMatchObject({ state: "up", localPort: 47123 });
    await harness.cleanup();
  });

  it("shares one in-flight spawn across concurrent ensure calls", async () => {
    const harness = createHarness();

    const [first, second] = await Promise.all([
      harness.manager.ensure("m1", SSH_SPEC, TARGET),
      harness.manager.ensure("m1", SSH_SPEC, TARGET),
    ]);

    expect(first).toEqual(second);
    expect(harness.spawns).toHaveLength(1);
    await harness.cleanup();
  });

  it("fails when the probe rejects, kills the child, and reports the failure", async () => {
    const harness = createHarness([Promise.reject(new Error("probe failed"))]);

    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).rejects.toThrow("probe failed");
    expect(spawnedChild(harness.spawns).killed).toBe(true);
    expect(harness.manager.status("m1")).toMatchObject({ state: "failed", error: "SSH tunnel did not become ready: probe failed" });

    await harness.cleanup();
  });

  it("fails with the ssh stderr tail when the child exits during the probe", async () => {
    const harness = createHarness([neverSettles]);
    const ensurePromise = harness.manager.ensure("m1", SSH_SPEC, TARGET);
    await vi.waitFor(() => { expect(harness.spawns).toHaveLength(1); });
    const child = spawnedChild(harness.spawns);
    child.emitStderr("jobs@devbox: Permission denied (publickey).\n");
    child.emitExit(255);
    await expect(ensurePromise).rejects.toThrow("Permission denied (publickey)");
    expect(harness.manager.status("m1")).toMatchObject({ state: "failed" });
    await harness.cleanup();
  });

  it("reports a failed tunnel when the child exits after becoming ready", async () => {
    const harness = createHarness();
    await harness.manager.ensure("m1", SSH_SPEC, TARGET);

    const child = spawnedChild(harness.spawns);
    child.emitStderr("Connection reset by peer\n");
    child.emitExit(255);

    const err = harness.manager.status("m1")?.error;
    expect(typeof err === "string" && err.includes("Connection reset")).toBe(true);
    await harness.cleanup();
  });

  it("honors the reconnect backoff window before respawning", async () => {
    const harness = createHarness([Promise.reject(new Error("first failure"))]);
    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).rejects.toThrow("first failure");

    // Still inside the backoff window: the failure is reported again without a new spawn.
    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).rejects.toThrow("first failure");
    expect(harness.spawns).toHaveLength(1);

    // After the window expires, ensure spawns again and succeeds.
    harness.advanceTime(5_001);
    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).resolves.toEqual({ localPort: 47123 });
    expect(harness.spawns).toHaveLength(2);
    await harness.cleanup();
  });

  it("cleans up all tunnels on close", async () => {
    const harness = createHarness();
    await harness.manager.ensure("m1", SSH_SPEC, TARGET);
    await harness.manager.ensure("m2", { host: "other" }, TARGET);

    await harness.manager.close();

    expect(spawnedChild(harness.spawns, 0).killed).toBe(true);
    expect(spawnedChild(harness.spawns, 1).killed).toBe(true);
    expect(harness.manager.status("m1")).toBeUndefined();
  });

  it("refuses ensure after close", async () => {
    const harness = createHarness();
    await harness.manager.close();

    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).rejects.toThrow("closed");
    await harness.cleanup();
  });
});

describe("SshTunnelManager password askpass", () => {
  it("writes an askpass script, exports it via SSH_ASKPASS_REQUIRE=force, and removes it after exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-web-askpass-test-"));
    tempDirs.push(dir);
    const spawns: FakeSshChild[] = [];

    const manager = new SshTunnelManager({
      spawnImpl: (command, args, options) => {
        const child = new FakeSshChild(args, options.env ?? {});
        spawns.push(child);
        return child;
      },
      connectProbe: () => neverSettles,
      allocatePort: () => Promise.resolve(47124),
      tempDir: () => Promise.resolve(dir),
    });

    const ensurePromise = manager.ensure("m1", { host: "devbox", password: "hunter2" }, TARGET);
    await vi.waitFor(() => { expect(spawns).toHaveLength(1); });

    const child = spawnedChild(spawns);
    expect(child.spawnEnv["SSH_ASKPASS_REQUIRE"]).toBe("force");
    const askpassPath = child.spawnEnv["SSH_ASKPASS"];
    expect(typeof askpassPath).toBe("string");
    expect(child.spawnEnv["PI_WEB_TUNNEL_PASSWORD"]).toBe("hunter2");
    if (typeof askpassPath !== "string") throw new Error("Expected an askpass script path");
    expect(await readFile(askpassPath, "utf8")).toContain('printf \'%s\\n\' "$PI_WEB_TUNNEL_PASSWORD"');
    expect((await stat(askpassPath)).mode & 0o077).toBe(0);

    child.emitExit(255);
    await expect(ensurePromise).rejects.toThrow();
    await expect(stat(askpassPath)).rejects.toMatchObject({ code: "ENOENT" });
    await manager.close();
  });
});

describe("SshTunnelManager closeMachine", () => {
  it("kills a machine's tunnel and rejects a subsequent ensure", async () => {
    const harness = createHarness();
    await harness.manager.ensure("m1", SSH_SPEC, TARGET);
    expect(spawnedChild(harness.spawns).killed).toBe(false);

    await harness.manager.closeMachine("m1");

    expect(spawnedChild(harness.spawns).killed).toBe(true);
    expect(harness.manager.status("m1")).toBeUndefined();
    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).resolves.toEqual({ localPort: 47123 });
    expect(harness.spawns).toHaveLength(2);
    await harness.cleanup();
  });

  it("rejects an in-flight ensure when the machine is closed", async () => {
    const harness = createHarness([neverSettles]);
    const ensurePromise = harness.manager.ensure("m1", SSH_SPEC, TARGET);
    await vi.waitFor(() => { expect(harness.spawns).toHaveLength(1); });

    await harness.manager.closeMachine("m1");

    await expect(ensurePromise).rejects.toThrow("tunnel closed for machine m1");
    await harness.cleanup();
  });
});

describe("SshTunnelManager close (global)", () => {
  it("rejects in-flight ensures so server shutdown does not block on probe timeouts", async () => {
    const harness = createHarness([neverSettles, neverSettles]);
    const first = harness.manager.ensure("m1", SSH_SPEC, TARGET);
    const second = harness.manager.ensure("m2", { host: "other" }, TARGET);
    await vi.waitFor(() => { expect(harness.spawns).toHaveLength(2); });

    await harness.manager.close();

    await expect(first).rejects.toThrow("closed");
    await expect(second).rejects.toThrow("closed");
  });

  it("rejects ensure after global close", async () => {
    const harness = createHarness();
    await harness.manager.close();
    await expect(harness.manager.ensure("m1", SSH_SPEC, TARGET)).rejects.toThrow("closed");
    await harness.cleanup();
  });
});

describe("SshTunnelManager spawn failures", () => {
  it("surfaces a spawn error from the ssh child", async () => {
    const harness = createHarness([neverSettles]);
    const ensurePromise = harness.manager.ensure("m1", SSH_SPEC, TARGET);
    await vi.waitFor(() => { expect(harness.spawns).toHaveLength(1); });
    spawnedChild(harness.spawns).emitError(new Error("spawn ssh ENOENT"));
    await expect(ensurePromise).rejects.toThrow("spawn ssh ENOENT");
    expect(harness.manager.status("m1")).toMatchObject({ state: "failed" });
    await harness.cleanup();
  });
});

describe("probeLocalListener", () => {
  it("keeps retrying until the local listener opens", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("expected a TCP address");
    const port = address.port;
    await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });

    // The first probes hit ECONNREFUSED; the listener appears only later.
    const reopen = setTimeout(() => { server.listen(port, "127.0.0.1"); }, 150);
    try {
      await probeLocalListener(port, 5_000);
    } finally {
      clearTimeout(reopen);
      await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
    }
  });

  it("rejects when no listener appears before the deadline", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("expected a TCP address");
    const port = address.port;
    await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });

    await expect(probeLocalListener(port, 250)).rejects.toThrow();
  });
});
