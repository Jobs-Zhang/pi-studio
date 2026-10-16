"use strict";

/**
 * Recent-connection history shaping for the desktop connect page.
 *
 * Pure so migration and dedupe rules can be tested without the filesystem or
 * Electron; main.cjs owns the file I/O and password encryption around it.
 */

const MAX_HISTORY = 10;

/**
 * Normalizes a raw config object: legacy string entries become direct entries,
 * malformed entries are dropped, and unknown config keys are preserved.
 */
function normalizeConfig(raw, maxHistory = MAX_HISTORY) {
  const recent = Array.isArray(raw.recentConnections) ? raw.recentConnections.map(normalizeEntry).filter((entry) => entry !== undefined) : [];
  return {
    ...raw,
    lastMode: raw.lastMode === "ssh" ? "ssh" : "direct",
    recentConnections: recent.slice(0, maxHistory),
  };
}

function normalizeEntry(entry) {
  if (typeof entry === "string" && entry !== "") return { type: "direct", url: entry };
  if (entry === null || typeof entry !== "object") return undefined;
  if (entry.type === "direct" && typeof entry.url === "string" && entry.url !== "") {
    return { type: "direct", url: entry.url, ...(typeof entry.lastUsedAt === "string" ? { lastUsedAt: entry.lastUsedAt } : {}) };
  }
  if (entry.type === "ssh" && typeof entry.host === "string" && entry.host !== "" && typeof entry.targetUrl === "string" && entry.targetUrl !== "") {
    return {
      type: "ssh",
      via: entry.via === "config" ? "config" : "manual",
      host: entry.host,
      ...(typeof entry.port === "number" ? { port: entry.port } : {}),
      ...(typeof entry.user === "string" && entry.user !== "" ? { user: entry.user } : {}),
      ...(typeof entry.identityFile === "string" && entry.identityFile !== "" ? { identityFile: entry.identityFile } : {}),
      ...(typeof entry.password === "string" && entry.password !== "" ? { password: entry.password } : {}),
      targetUrl: entry.targetUrl,
      ...(typeof entry.lastUsedAt === "string" ? { lastUsedAt: entry.lastUsedAt } : {}),
    };
  }
  return undefined;
}

function connectionKey(entry) {
  if (entry.type !== "ssh") return `direct:${entry.url}`;
  // Config and manual connections with the same host stay distinct entries.
  const via = entry.via === "config" ? "config" : "manual";
  return `ssh:${via}:${entry.user ?? ""}@${entry.host}:${String(entry.port ?? 22)}->${entry.targetUrl}`;
}

/** Moves the entry to the front of the list, replacing any same-key entry and stamping the usage time. */
function recordConnectionEntry(list, entry, nowIso = new Date().toISOString(), maxHistory = MAX_HISTORY) {
  return [{ ...entry, lastUsedAt: nowIso }, ...list.filter((item) => connectionKey(item) !== connectionKey(entry))].slice(0, maxHistory);
}

/** Renderer-facing view: stored passwords never leave the main process. */
function publicEntry(entry) {
  const { password, ...rest } = entry;
  return { ...rest, hasPassword: typeof password === "string" && password !== "" };
}

module.exports = { MAX_HISTORY, normalizeConfig, normalizeEntry, connectionKey, recordConnectionEntry, publicEntry };
