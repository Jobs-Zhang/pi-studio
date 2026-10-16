import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MachineService } from "./machineService.js";
import { MachineStore } from "./machineStore.js";
import { registerMachineRoutes } from "./machineRoutes.js";

let tempDir: string;
let app: FastifyInstance | undefined;
let service: MachineService;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pi-web-machine-routes-test-"));
  service = new MachineService(new MachineStore(join(tempDir, "machines.json")));
});

afterEach(async () => {
  await app?.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe("machine routes", () => {
  it("creates and returns ssh machines with a sanitized connection", async () => {
    app = Fastify();
    registerMachineRoutes(app, service);
    await app.ready();

    const created = await app.inject({
      method: "POST",
      url: "/api/machines",
      payload: {
        name: "Home Dev",
        baseUrl: "http://127.0.0.1:8505",
        connection: { mode: "ssh", ssh: { host: "home", password: "secret" } },
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      name: "Home Dev",
      connection: { mode: "ssh", ssh: { host: "home", hasPassword: true } },
    });
    // Password must not be returned by the API.
    expect(created.json()).not.toHaveProperty("connection.ssh.password");

    const listed = await app.inject({ method: "GET", url: "/api/machines" });
    expect(listed.payload).toContain('"connection":{"mode":"ssh","ssh":{"host":"home","hasPassword":true}}');
  });

  it("rejects invalid ssh connections with a 400", async () => {
    app = Fastify();
    registerMachineRoutes(app, service);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/machines",
      payload: { name: "No Host", baseUrl: "http://127.0.0.1:8505", connection: { mode: "ssh", ssh: { host: "" } } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Machine ssh host is required" });
  });

  it("lists ssh config host aliases from the configured path", async () => {
    const configPath = join(tempDir, "ssh-config");
    await writeFile(configPath, "Host alpha\nHost beta\nHost *\n", "utf8");
    app = Fastify();
    registerMachineRoutes(app, service, { sshConfigPath: () => configPath });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/api/machines/ssh-config/hosts" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hosts: ["alpha", "beta"] });
  });

  it("returns an empty host list when no ssh config exists", async () => {
    app = Fastify();
    registerMachineRoutes(app, service, { sshConfigPath: () => join(tempDir, "missing") });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/api/machines/ssh-config/hosts" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hosts: [] });
  });
});