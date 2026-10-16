"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { stat } = require("node:fs/promises");
const { createServer } = require("node:net");
const { homedir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const { buildSshArgs, buildAskpassEnv, expandHomePath, deriveLocalPort, allocateTunnelPort, createTunnel } = require("./tunnel.cjs");

const TARGET = { host: "127.0.0.1", port: 8504 };

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stderr = new EventEmitter();
    this.killed = false;
  }

  kill() {
    this.killed = true;
    return true;
  }
}

function fakeTunnelDeps(platform) {
  const state = { env: undefined, child: undefined };
  return {
    state,
    deps: {
      platform,
      execPath: "/apps/PI Desktop",
      spawnImpl: (_command, _args, options) => {
        state.env = options.env;
        state.child = new FakeChild();
        return state.child;
      },
      allocatePort: async () => 4321,
      connectProbe: async () => {},
    },
  };
}

test("buildSshArgs builds a local forward with the fixed safety options", () => {
  const args = buildSshArgs(49152, { host: "dev-box", port: 2222, user: "deploy", identityFile: "/keys/id" }, TARGET);

  assert.deepEqual(args, [
    "-N",
    "-L", "127.0.0.1:49152:127.0.0.1:8504",
    "-p", "2222",
    "-l", "deploy",
    "-i", "/keys/id",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    "dev-box",
  ]);
});

test("buildSshArgs omits port, user and identity when unset and brackets IPv6 targets", () => {
  const args = buildSshArgs(1024, { host: "user@dev-box" }, { host: "::1", port: 443 });

  assert.deepEqual(args, [
    "-N",
    "-L", "127.0.0.1:1024:[::1]:443",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    "user@dev-box",
  ]);
});

test("expandHomePath resolves a leading ~ so spawned args need no shell", () => {
  assert.equal(expandHomePath("~/.ssh/id_ed25519"), join(homedir(), ".ssh/id_ed25519"));
  assert.equal(expandHomePath("/abs/path"), "/abs/path");
});

test("buildAskpassEnv passes the password out-of-band and marks self-askpass", () => {
  assert.deepEqual(buildAskpassEnv({ password: "secret", askpassPath: "/app/PI Desktop", selfAskpass: true }), {
    SSH_ASKPASS: "/app/PI Desktop",
    SSH_ASKPASS_REQUIRE: "force",
    DISPLAY: ":",
    PI_WEB_ASKPASS: "1",
    PI_WEB_TUNNEL_PASSWORD: "secret",
  });

  assert.deepEqual(buildAskpassEnv({ password: "secret", askpassPath: "/tmp/askpass.sh", selfAskpass: false }), {
    SSH_ASKPASS: "/tmp/askpass.sh",
    SSH_ASKPASS_REQUIRE: "force",
    DISPLAY: ":",
    PI_WEB_TUNNEL_PASSWORD: "secret",
  });
});

test("createTunnel wires an executable askpass script and cleans it up", async () => {
  const { state, deps } = fakeTunnelDeps("linux");
  const handle = await createTunnel({ host: "dev-box", password: "secret" }, TARGET, deps);

  const script = state.env.SSH_ASKPASS;
  const info = await stat(script);
  // ssh must be able to execute the askpass script: a missing execute bit
  // silently breaks every password authentication.
  assert.equal(info.mode & 0o100, 0o100);
  assert.equal(state.env.PI_WEB_TUNNEL_PASSWORD, "secret");
  assert.equal(state.env.SSH_ASKPASS_REQUIRE, "force");

  await handle.close();
  assert.equal(state.child.killed, true);
  await assert.rejects(stat(script));
});

test("createTunnel uses the app itself as askpass on Windows", async () => {
  const { state, deps } = fakeTunnelDeps("win32");
  await createTunnel({ host: "dev-box", password: "secret" }, TARGET, deps);

  assert.equal(state.env.SSH_ASKPASS, "/apps/PI Desktop");
  assert.equal(state.env.PI_WEB_ASKPASS, "1");
});

test("createTunnel adds no askpass env for key-based auth", async () => {
  const { state, deps } = fakeTunnelDeps("linux");
  await createTunnel({ host: "dev-box", identityFile: "/keys/id" }, TARGET, deps);

  assert.equal(state.env.SSH_ASKPASS, undefined);
  assert.equal(state.env.PI_WEB_TUNNEL_PASSWORD, undefined);
});

test("deriveLocalPort is deterministic, in range, and per identity", () => {
  const spec = { host: "dev-box", port: 2222, user: "deploy" };
  const port = deriveLocalPort(spec, TARGET);

  assert.equal(deriveLocalPort(spec, TARGET), port);
  assert.ok(port >= 20000 && port < 30000, `expected 20000-29999, got ${String(port)}`);
  // Different connection identities must not collapse onto one loopback origin.
  assert.notEqual(deriveLocalPort({ host: "other-box" }, TARGET), port);
  assert.notEqual(deriveLocalPort(spec, { host: "127.0.0.1", port: 9000 }), port);
});

test("allocateTunnelPort returns the connection's derived port when it is free", async () => {
  const spec = { host: "stable-box", port: 22 };

  assert.equal(await allocateTunnelPort(spec, TARGET), deriveLocalPort(spec, TARGET));
});

test("allocateTunnelPort falls back to the next free port when the derived one is taken", async () => {
  const spec = { host: "busy-box", port: 22 };
  const preferred = deriveLocalPort(spec, TARGET);
  const blocker = createServer();
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(preferred, "127.0.0.1", resolve);
  });
  try {
    const allocated = await allocateTunnelPort(spec, TARGET);

    assert.notEqual(allocated, preferred);
    assert.ok(allocated >= 20000 && allocated < 30000);
  } finally {
    await new Promise((resolve) => { blocker.close(resolve); });
  }
});

test("createTunnel passes the connection identity to the port allocator", async () => {
  const { deps } = fakeTunnelDeps("linux");
  let received;
  deps.allocatePort = async (spec, target) => { received = { spec, target }; return 4321; };
  const spec = { host: "dev-box" };

  await createTunnel(spec, TARGET, deps);

  assert.deepEqual(received, { spec, target: TARGET });
});
