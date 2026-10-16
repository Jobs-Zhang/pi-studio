"use strict";

/**
 * OpenSSH config parsing for the desktop connect page.
 *
 * The desktop shell is plain CommonJS and runs before any server exists, so it
 * cannot reuse the server-side TypeScript parser. It mirrors the same alias
 * rules (no wildcards, no negations) and the same `Include` semantics: include
 * paths resolve relative to the including file's directory, unreadable files
 * and cycles are ignored so a broken user config never blocks connecting.
 */

const { readFile, realpath } = require("node:fs/promises");
const { dirname, isAbsolute, join, resolve } = require("node:path");
const { homedir } = require("node:os");

const HOST_DIRECTIVE = "host";
const INCLUDE_DIRECTIVE = "include";
const OPTION_KEYS = new Set(["hostname", "port", "user", "identityfile"]);
const WILDCARD_PATTERN = /[*?]/;

/**
 * Parses ssh config content into an ordered directive list. Pure so the parser
 * can be tested without the filesystem; `include` directives stay in place so
 * the file walker can splice them in at the right position.
 */
function parseSshConfigDirectives(content) {
  const directives = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.search(/[ \t]/);
    const key = (separator === -1 ? trimmed : trimmed.slice(0, separator)).toLowerCase();
    const value = separator === -1 ? "" : trimmed.slice(separator).trim();
    if (key === HOST_DIRECTIVE) {
      directives.push({ type: "host", patterns: parseHostPatterns(value) });
    } else if (key === INCLUDE_DIRECTIVE) {
      directives.push({ type: "include", paths: value.split(/[ \t]+/).filter((token) => token !== "") });
    } else if (OPTION_KEYS.has(key)) {
      directives.push({ type: "option", key, value: firstToken(value) });
    }
  }
  return directives;
}

function parseHostPatterns(argument) {
  const patterns = [];
  for (const token of argument.split(/[ \t]+/)) {
    if (token === "") continue;
    if (token.startsWith("#")) break;
    patterns.push(token.startsWith("!") ? { text: token.slice(1), negated: true } : { text: token, negated: false });
  }
  return patterns;
}

function firstToken(value) {
  const token = value.split(/[ \t]+/)[0];
  return token === undefined ? "" : token;
}

/** Groups directives into ordered blocks: leading options form a global block. */
function blocksFromDirectives(directives) {
  const blocks = [];
  let current = { patterns: [], options: {} };
  for (const directive of directives) {
    if (directive.type === "host") {
      current = { patterns: directive.patterns, options: {} };
      blocks.push(current);
    } else if (directive.type === "option") {
      // First value wins, matching ssh's "first obtained value is used" rule.
      if (current.options[directive.key] === undefined) current.options[directive.key] = directive.value;
    }
  }
  return blocks.filter((block) => block.patterns.length > 0 || Object.keys(block.options).length > 0);
}

/**
 * Resolves the effective connection options for one alias: every block whose
 * patterns match (global block included) contributes its first-seen values,
 * earlier blocks overriding later ones.
 */
function resolveSshHost(blocks, alias) {
  const resolved = { hostName: alias, port: undefined, user: undefined, identityFile: undefined };
  const seen = { hostName: false, port: false, user: false, identityFile: false };
  let matched = false;
  for (const block of blocks) {
    if (!blockMatches(block.patterns, alias)) continue;
    matched = true;
    const { hostname, port, user, identityfile } = block.options;
    if (!seen.hostName && hostname !== undefined) {
      resolved.hostName = hostname;
      seen.hostName = true;
    }
    if (!seen.port && port !== undefined && /^\d+$/.test(port)) {
      resolved.port = Number(port);
      seen.port = true;
    }
    if (!seen.user && user !== undefined) {
      resolved.user = user;
      seen.user = true;
    }
    if (!seen.identityFile && identityfile !== undefined) {
      resolved.identityFile = identityfile;
      seen.identityFile = true;
    }
  }
  return matched ? resolved : undefined;
}

/** Lists concrete (non-wildcard, non-negated) aliases for the host dropdown. */
function listSshConfigAliases(blocks) {
  const aliases = [];
  for (const block of blocks) {
    for (const pattern of block.patterns) {
      if (pattern.negated || WILDCARD_PATTERN.test(pattern.text)) continue;
      if (!aliases.includes(pattern.text)) aliases.push(pattern.text);
    }
  }
  return aliases;
}

function blockMatches(patterns, alias) {
  // A block with no patterns is the global block: it applies to every alias.
  if (patterns.length === 0) return true;
  let positive = false;
  for (const pattern of patterns) {
    if (!globMatches(pattern.text, alias)) continue;
    if (pattern.negated) return false;
    positive = true;
  }
  return positive;
}

function globMatches(pattern, value) {
  const source = [...pattern].map((char) => {
    if (char === "*") return ".*";
    if (char === "?") return ".";
    return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${source.join("")}$`, "iu").test(value);
}

/**
 * Loads one config file with its `Include` directives expanded into an
 * inlined directive list. Returns [] when the file is absent or unreadable.
 */
async function loadSshConfigDirectives(configPath) {
  const directives = [];
  await collectDirectives(resolve(configPath), new Set(), directives);
  return directives;
}

async function collectDirectives(configPath, visited, directives) {
  const canonical = await realpath(configPath).catch(() => undefined);
  const marker = canonical === undefined ? configPath : canonical;
  if (visited.has(marker)) return;
  visited.add(marker);

  let content;
  try {
    content = await readFile(configPath, "utf8");
  } catch {
    return;
  }

  for (const directive of parseSshConfigDirectives(content)) {
    if (directive.type !== "include") {
      directives.push(directive);
      continue;
    }
    for (const rawPath of directive.paths) {
      for (const includePath of expandIncludePaths(rawPath, dirname(configPath))) {
        await collectDirectives(includePath, visited, directives);
      }
    }
  }
}

function expandIncludePaths(rawPath, baseDir) {
  const expanded = expandHome(rawPath);
  if (isAbsolute(expanded)) return [expanded];
  return [resolve(baseDir, expanded)];
}

function expandHome(path) {
  return path.startsWith("~/") || path === "~" ? join(homedir(), path.slice(1)) : path;
}

/** Convenience wrapper: load and group in one step. */
async function loadSshConfigBlocks(configPath) {
  return blocksFromDirectives(await loadSshConfigDirectives(configPath));
}

module.exports = {
  parseSshConfigDirectives,
  blocksFromDirectives,
  resolveSshHost,
  listSshConfigAliases,
  loadSshConfigDirectives,
  loadSshConfigBlocks,
  expandHome,
};
