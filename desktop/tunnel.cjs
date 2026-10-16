"use strict";

/**
 * Local `ssh -N -L` tunnel lifecycle for the desktop connect page.
 *
 * Mirrors the server-side SshTunnelManager option contract but is deliberately
 * smaller: the connect page opens one gateway at a time, so a single handle is
 * enough and no reconnect/backoff bookkeeping is needed. Passwords are handed
 * to ssh through SSH_ASKPASS; the askpass program is this same executable in
 * packaged builds (see the PI_WEB_ASKPASS bootstrap in main.cjs), which works
 * on Windows where a shell script cannot be executed.
 */

const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { writeFile, rm, mkdir } = require("node:fs/promises");
const { createConnection, createServer } = require("node:net");
const { homedir, tmpdir } = require("node:os");
const { join } = require("node:path");

const PROBE_TIMEOUT_MS = 10_000;
const STDERR_TAIL_LINES = 50;
const STDERR_SUMMARY_LINES = 5;
// Owner-only but executable: ssh runs the script to obtain the password, so a
// missing execute bit makes every password authentication fail.
const ASKPASS_SCRIPT_MODE = 0o700;

/** Expands a leading `~/` since spawned arguments never go through a shell. */
function expandHomePath(path) {
  return path.startsWith("~/") || path === "~" ? join(homedir(), path.slice(1)) : path;
}

/**
 * Builds the ssh command line for a local forward. ExitOnForwardFailure turns a
 * port clash into a loud exit, ServerAlive* detects dead connections, and
 * accept-new keeps first-connect host key confirmation non-interactive while
 * still rejecting changed keys.
 */
function buildSshArgs(localPort, spec, target) {
  return [
    "-N",
    "-L", `127.0.0.1:${String(localPort)}:${formatTargetHost(target.host)}:${String(target.port)}`,
    ...(spec.port === undefined ? [] : ["-p", String(spec.port)]),
    ...(spec.user === undefined || spec.user === "" ? [] : ["-l", spec.user]),
    ...(spec.identityFile === undefined || spec.identityFile === "" ? [] : ["-i", expandHomePath(spec.identityFile)]),
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    spec.host,
  ];
}

function formatTargetHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

/**
 * Env overrides for the ssh child when a password must be supplied. The
 * password travels via PI_WEB_TUNNEL_PASSWORD so the askpass program needs no
 * escaping and never sees it on its command line.
 */
function buildAskpassEnv({ password, askpassPath, selfAskpass }) {
  return {
    SSH_ASKPASS: askpassPath,
    SSH_ASKPASS_REQUIRE: "force",
    DISPLAY: ":",
    ...(selfAskpass ? { PI_WEB_ASKPASS: "1" } : {}),
    PI_WEB_TUNNEL_PASSWORD: password,
  };
}

/** Detects the local OpenSSH client; `ssh -V` prints its version on stderr. */
function detectSshClient(spawnImpl = spawn) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl("ssh", ["-V"], { stdio: ["ignore", "ignore", "pipe"] });
    } catch {
      resolve({ available: false });
      return;
    }
    let output = "";
    const finish = (available) => {
      const match = /OpenSSH[_\w.\-]*/i.exec(output);
      resolve(available ? { available: true, version: match === null ? undefined : match[0] } : { available: false });
    };
    child.stdout?.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0));
  });
}

async function allocateFreePort() {
  return await new Promise((resolve, reject) => {
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
 * successful TCP connect proves both. Until then the connect is refused, so
 * the probe retries until the deadline. The socket is destroyed immediately.
 */
function probeLocalListener(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const attempt = () => new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error === undefined) resolve();
      else reject(error);
    };
    socket.once("connect", () => { settle(); });
    socket.once("error", (error) => { settle(error); });
    socket.setTimeout(Math.min(1000, Math.max(1, deadline - Date.now())), () => { settle(new Error("tunnel readiness probe timed out")); });
  });

  return (async () => {
    let lastError = new Error(`tunnel readiness probe timed out after ${String(timeoutMs)}ms`);
    while (Date.now() < deadline) {
      try {
        await attempt();
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      }
    }
    throw lastError;
  })();
}

async function createAskpassScript() {
  const dir = join(tmpdir(), "pi-desktop-askpass");
  await mkdir(dir, { recursive: true });
  const scriptPath = join(dir, `pi-desktop-askpass-${randomUUID()}.sh`);
  await writeFile(scriptPath, '#!/bin/sh\nprintf \'%s\\n\' "$PI_WEB_TUNNEL_PASSWORD"\n', { mode: ASKPASS_SCRIPT_MODE });
  return { scriptPath, cleanup: async () => { await rm(scriptPath, { force: true }); } };
}

/**
 * Opens one tunnel and resolves once the local listener accepts connections
 * (i.e. authentication succeeded). Rejects with a message carrying the ssh
 * stderr summary so the UI can show why the connection failed.
 *
 * deps keeps the process/socket/file boundaries replaceable in tests.
 */
async function createTunnel(spec, target, deps = {}) {
  const spawnImpl = deps.spawnImpl ?? spawn;
  const allocatePort = deps.allocatePort ?? allocateFreePort;
  const connectProbe = deps.connectProbe ?? probeLocalListener;
  const platform = deps.platform ?? process.platform;
  const execPath = deps.execPath ?? process.execPath;
  const probeTimeoutMs = deps.probeTimeoutMs ?? PROBE_TIMEOUT_MS;

  const localPort = await allocatePort();
  const args = buildSshArgs(localPort, spec, target);

  let askpassCleanup;
  let envOverrides = {};
  if (spec.password !== undefined && spec.password !== "") {
    if (platform === "win32") {
      // Windows cannot execute a shell script as askpass, so the askpass program
      // is this executable itself (see the PI_WEB_ASKPASS bootstrap in main.cjs).
      envOverrides = buildAskpassEnv({ password: spec.password, askpassPath: execPath, selfAskpass: true });
    } else {
      const askpass = await createAskpassScript();
      askpassCleanup = askpass.cleanup;
      envOverrides = buildAskpassEnv({ password: spec.password, askpassPath: askpass.scriptPath, selfAskpass: false });
    }
  }

  const child = spawnImpl("ssh", args, { env: { ...process.env, ...envOverrides }, stdio: ["ignore", "ignore", "pipe"] });
  const stderrTail = [];
  child.stderr?.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (line.trim() === "") continue;
      stderrTail.push(line);
      if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift();
    }
  });

  // The readiness probe races child failure: a rejected ssh process (auth
  // failure, dead host) never opens the local listener, so the probe would
  // otherwise hang until its own timeout.
  let rejectChildFailure;
  const childFailure = new Promise((_resolve, reject) => {
    rejectChildFailure = reject;
  });
  childFailure.catch(() => undefined);

  let settled = false;
  const fail = (reason) => {
    if (settled) return;
    settled = true;
    const summary = stderrTail.slice(-STDERR_SUMMARY_LINES).join("\n").trim();
    rejectChildFailure(new Error(summary === "" ? reason : summary));
  };
  child.once("exit", (code) => fail(`ssh exited with code ${code === null ? "unknown" : String(code)}`));
  child.once("error", (error) => fail(error.message));

  try {
    await Promise.race([connectProbe(localPort, probeTimeoutMs), childFailure]);
    settled = true;
  } catch (error) {
    settled = true;
    if (!child.killed) child.kill();
    await askpassCleanup?.();
    throw error;
  }

  return {
    localPort,
    close: async () => {
      if (!child.killed) child.kill();
      await askpassCleanup?.();
    },
  };
}

module.exports = {
  buildSshArgs,
  buildAskpassEnv,
  expandHomePath,
  detectSshClient,
  allocateFreePort,
  createTunnel,
};
