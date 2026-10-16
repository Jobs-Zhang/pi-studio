import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

const HOST_DIRECTIVE_PATTERN = /^[ \t]*Host[ \t]+(.+)$/iu;
const INCLUDE_DIRECTIVE_PATTERN = /^[ \t]*Include[ \t]+(.+)$/iu;
const WILDCARD_PATTERN = /[*?]/u;

/**
 * Extracts usable host aliases (no wildcards, no negations, no inline comments)
 * from an ssh config `Host` directive argument. Shared by the pure parser and the
 * file walker so both agree on alias rules.
 */
function hostAliases(directiveArgument: string): string[] {
  const tokens = directiveArgument.split(/[ \t]+/u).filter((token) => token !== "");
  const aliases: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("#")) break;
    if (token.startsWith("!") || WILDCARD_PATTERN.test(token)) continue;
    if (!aliases.includes(token)) aliases.push(token);
  }
  return aliases;
}

/**
 * Extracts usable host aliases (no wildcards, no negations) from `~/.ssh/config`
 * file content. Pure so callers can test parsing without touching the filesystem.
 */
export function parseSshConfigHosts(content: string): string[] {
  const hosts: string[] = [];
  for (const line of content.split(/\r?\n/u)) {
    const aliases = hostAliasesFromLine(line);
    if (aliases === undefined) continue;
    for (const alias of aliases) {
      if (!hosts.includes(alias)) hosts.push(alias);
    }
  }
  return hosts;
}

/**
 * Reads an ssh config file and collects host aliases across `Include` directives.
 * Include paths resolve relative to the including file's directory, matching
 * OpenSSH behavior; unreadable files and include cycles are ignored so a broken
 * user config never breaks machine management. Returns [] when the file is absent.
 */
export async function listSshConfigHosts(configPath: string): Promise<string[]> {
  const hosts: string[] = [];
  await collectHosts(resolve(configPath), new Set<string>(), hosts);
  return hosts;
}

async function collectHosts(configPath: string, visited: Set<string>, hosts: string[]): Promise<void> {
  const canonical = await realPathOrNull(configPath);
  if (canonical !== null) {
    if (visited.has(canonical)) return;
    visited.add(canonical);
  }

  let content: string;
  try {
    content = await readFile(configPath, "utf8");
  } catch {
    return;
  }

  const includePaths: string[] = [];
  for (const line of content.split(/\r?\n/u)) {
    const aliases = hostAliasesFromLine(line);
    if (aliases !== undefined) {
      for (const alias of aliases) {
        if (!hosts.includes(alias)) hosts.push(alias);
      }
      continue;
    }
    const includeMatch = INCLUDE_DIRECTIVE_PATTERN.exec(line);
    if (includeMatch !== null) {
      const paths = includeMatch[1];
      if (paths === undefined) continue;
      for (const path of paths.split(/[ \t]+/u)) {
        const trimmed = path.trim();
        if (trimmed !== "" && !trimmed.startsWith("#")) includePaths.push(trimmed);
      }
    }
  }

  for (const includePath of includePaths) {
    await collectHosts(isAbsolute(includePath) ? includePath : join(dirname(configPath), includePath), visited, hosts);
  }
}

/** Host aliases of a `Host` directive line, or undefined when the line is not one. */
function hostAliasesFromLine(line: string): string[] | undefined {
  const match = HOST_DIRECTIVE_PATTERN.exec(line);
  if (match === null) return undefined;
  const argument = match[1];
  if (argument === undefined) return undefined;
  return hostAliases(argument);
}

async function realPathOrNull(path: string): Promise<string | null> {
  try {
    const { realpath } = await import("node:fs/promises");
    return await realpath(path);
  } catch {
    return null;
  }
}
