"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { normalizeConfig, connectionKey, recordConnectionEntry, publicEntry } = require("./history.cjs");

test("normalizeConfig migrates legacy string entries and drops garbage", () => {
  const config = normalizeConfig({
    recentConnections: ["http://192.168.1.100:8504", "", 42, { type: "ssh", host: "dev-box", targetUrl: "http://127.0.0.1:8504", password: "blob" }, { type: "ssh", via: "config", host: "staging", targetUrl: "http://127.0.0.1:8504" }],
    keepMe: "untouched",
  });

  assert.equal(config.lastMode, "direct");
  assert.equal(config.keepMe, "untouched");
  assert.deepEqual(config.recentConnections, [
    { type: "direct", url: "http://192.168.1.100:8504" },
    { type: "ssh", via: "manual", host: "dev-box", targetUrl: "http://127.0.0.1:8504", password: "blob" },
    { type: "ssh", via: "config", host: "staging", targetUrl: "http://127.0.0.1:8504" },
  ]);
});

test("normalizeConfig keeps lastMode and caps the history length", () => {
  const config = normalizeConfig({
    lastMode: "ssh",
    recentConnections: ["a", "b", "c"],
  }, 2);

  assert.equal(config.lastMode, "ssh");
  assert.deepEqual(config.recentConnections.map((entry) => entry.url), ["a", "b"]);
});

test("recordConnectionEntry dedupes by connection key and stamps usage time", () => {
  const sshEntry = { type: "ssh", via: "manual", host: "dev-box", user: "deploy", targetUrl: "http://127.0.0.1:8504", password: "blob" };
  const list = recordConnectionEntry([], sshEntry, "2026-10-13T08:00:00.000Z");
  assert.equal(list.length, 1);
  assert.equal(list[0].lastUsedAt, "2026-10-13T08:00:00.000Z");

  const updated = recordConnectionEntry(list, { ...sshEntry, port: 2222 }, "2026-10-13T09:00:00.000Z");
  // A changed port is a different connection, so both entries remain.
  assert.equal(updated.length, 2);

  // A config-driven connection to the same host is a separate entry.
  const both = recordConnectionEntry(updated, { type: "ssh", via: "config", host: "dev-box", targetUrl: "http://127.0.0.1:8504" }, "2026-10-13T09:30:00.000Z");
  assert.equal(both.length, 3);

  const moved = recordConnectionEntry(both, { ...sshEntry }, "2026-10-13T10:00:00.000Z");
  assert.equal(moved.length, 3);
  assert.equal(moved[0].lastUsedAt, "2026-10-13T10:00:00.000Z");
  // The stored password survives a reconnect that adds no new secret.
  assert.equal(moved[0].password, "blob");
});

test("connectionKey distinguishes direct urls, ssh identity and config/manual source", () => {
  assert.equal(connectionKey({ type: "direct", url: "http://a" }), "direct:http://a");
  assert.equal(
    connectionKey({ type: "ssh", via: "manual", host: "dev-box", targetUrl: "http://127.0.0.1:8504" }),
    connectionKey({ type: "ssh", host: "dev-box", port: 22, targetUrl: "http://127.0.0.1:8504" }),
  );
  assert.notEqual(
    connectionKey({ type: "ssh", via: "config", host: "dev-box", targetUrl: "http://127.0.0.1:8504" }),
    connectionKey({ type: "ssh", via: "manual", host: "dev-box", targetUrl: "http://127.0.0.1:8504" }),
  );
});

test("publicEntry strips the stored password and reports its presence", () => {
  assert.deepEqual(
    publicEntry({ type: "ssh", host: "dev-box", targetUrl: "http://127.0.0.1:8504", password: "blob" }),
    { type: "ssh", host: "dev-box", targetUrl: "http://127.0.0.1:8504", hasPassword: true },
  );
  assert.deepEqual(
    publicEntry({ type: "ssh", host: "dev-box", targetUrl: "http://127.0.0.1:8504" }),
    { type: "ssh", host: "dev-box", targetUrl: "http://127.0.0.1:8504", hasPassword: false },
  );
});
