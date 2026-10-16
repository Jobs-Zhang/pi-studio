"use strict";

const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const {
  parseSshConfigDirectives,
  blocksFromDirectives,
  resolveSshHost,
  listSshConfigAliases,
  loadSshConfigBlocks,
} = require("./sshConfig.cjs");

test("parseSshConfigDirectives keeps host patterns, options and includes in order", () => {
  const directives = parseSshConfigDirectives([
    "# comment",
    "",
    "Host dev-box *.corp !bad",
    "  HostName dev.example.com",
    "  Port 2222",
    "  User deploy",
    "  IdentityFile ~/.ssh/id_ed25519",
    "Include extra.conf",
  ].join("\n"));

  assert.deepEqual(directives, [
    { type: "host", patterns: [{ text: "dev-box", negated: false }, { text: "*.corp", negated: false }, { text: "bad", negated: true }] },
    { type: "option", key: "hostname", value: "dev.example.com" },
    { type: "option", key: "port", value: "2222" },
    { type: "option", key: "user", value: "deploy" },
    { type: "option", key: "identityfile", value: "~/.ssh/id_ed25519" },
    { type: "include", paths: ["extra.conf"] },
  ]);
});

test("resolveSshHost applies matching blocks first-value-wins across the config", () => {
  const blocks = blocksFromDirectives(parseSshConfigDirectives([
    // Specific blocks come first so their values win, as in real ssh configs.
    "Host dev-box",
    "  HostName dev.example.com",
    "  Port 2222",
    "  User deploy",
    "Host *",
    "  User default-user",
    "  Port 22",
  ].join("\n")));

  assert.deepEqual(resolveSshHost(blocks, "dev-box"), {
    hostName: "dev.example.com",
    port: 2222,
    user: "deploy",
    identityFile: undefined,
  });

  // A wildcard block still contributes its values to unlisted aliases.
  assert.deepEqual(resolveSshHost(blocks, "other"), {
    hostName: "other",
    port: 22,
    user: "default-user",
    identityFile: undefined,
  });
});

test("resolveSshHost ignores negated patterns and keeps hostName default", () => {
  const blocks = blocksFromDirectives(parseSshConfigDirectives([
    "Host *.example.com !blocked.example.com",
    "  User shared",
  ].join("\n")));

  assert.equal(resolveSshHost(blocks, "blocked.example.com"), undefined);
  assert.deepEqual(resolveSshHost(blocks, "api.example.com"), {
    hostName: "api.example.com",
    port: undefined,
    user: "shared",
    identityFile: undefined,
  });
});

test("listSshConfigAliases lists only concrete alias names", () => {
  const blocks = blocksFromDirectives(parseSshConfigDirectives([
    "Host dev-box staging web",
    "Host dev-box",
    "Host *.corp !bad",
  ].join("\n")));

  assert.deepEqual(listSshConfigAliases(blocks), ["dev-box", "staging", "web"]);
});

test("loadSshConfigBlocks inlines relative includes and ignores cycles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-desktop-sshconfig-"));
  try {
    await writeFile(join(dir, "config"), "Include conf.d/extra.conf\nHost main\n  User root\n");
    await mkdir(join(dir, "conf.d"));
    // The include cycle back to the root config must terminate quietly.
    await writeFile(join(dir, "conf.d", "extra.conf"), "Include ../config\nHost extra\n  User extra-user\n");

    const blocks = await loadSshConfigBlocks(join(dir, "config"));
    assert.deepEqual(listSshConfigAliases(blocks), ["extra", "main"]);
    assert.equal(resolveSshHost(blocks, "extra")?.user, "extra-user");
    assert.equal(resolveSshHost(blocks, "main")?.user, "root");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadSshConfigBlocks returns no blocks for a missing file", async () => {
  const blocks = await loadSshConfigBlocks(join(tmpdir(), "pi-desktop-does-not-exist.conf"));
  assert.deepEqual(blocks, []);
});
