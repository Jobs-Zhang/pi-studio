import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listSshConfigHosts, parseSshConfigHosts } from "./sshConfigParser.js";

describe("parseSshConfigHosts", () => {
  it("collects host aliases in order and deduplicates them", () => {
    const hosts = parseSshConfigHosts([
      "Host devbox staging",
      "  HostName 10.0.0.1",
      "Host devbox",
      "Host office",
      "  User jobs",
    ].join("\n"));
    expect(hosts).toEqual(["devbox", "staging", "office"]);
  });

  it("skips wildcard, negated, and comment patterns", () => {
    const hosts = parseSshConfigHosts([
      "Host *",
      "  ServerAliveInterval 30",
      "Host !blocked",
      "Host *.example.com",
      "Host real-host # trailing comment",
      "# Host commented-out",
    ].join("\n"));
    expect(hosts).toEqual(["real-host"]);
  });

  it("matches Host keyword case-insensitively and ignores indentation", () => {
    const hosts = parseSshConfigHosts("\tHoSt\t  spaced\nHostName 10.0.0.2\n");
    expect(hosts).toEqual(["spaced"]);
  });

  it("ignores hostnames that are keywords of other directives", () => {
    const hosts = parseSshConfigHosts([
      "HostName 10.0.0.3",
      "HostnameAlias nothing",
      "Host real",
    ].join("\n"));
    expect(hosts).toEqual(["real"]);
  });

  it("returns an empty list for empty or fully commented config", () => {
    expect(parseSshConfigHosts("")).toEqual([]);
    expect(parseSshConfigHosts("# only comments\n\n")).toEqual([]);
  });
});

describe("listSshConfigHosts", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pi-web-ssh-config-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns [] when the config file does not exist", async () => {
    await expect(listSshConfigHosts(join(tempDir, "missing-config"))).resolves.toEqual([]);
  });

  it("expands Include directives relative to the config directory", async () => {
    await mkdir(join(tempDir, "conf.d"));
    await writeFile(join(tempDir, "config"), "Host top-level\nInclude conf.d/work\n", "utf8");
    await writeFile(join(tempDir, "conf.d", "work"), "Host work-box\n", "utf8");

    await expect(listSshConfigHosts(join(tempDir, "config"))).resolves.toEqual(["top-level", "work-box"]);
  });

  it("ignores unreadable included files and include cycles", async () => {
    await writeFile(join(tempDir, "config"), "Host first\nInclude self\nInclude missing-file\n", "utf8");

    await expect(listSshConfigHosts(join(tempDir, "config"))).resolves.toEqual(["first"]);
  });
});
