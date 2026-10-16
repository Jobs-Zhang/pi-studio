import {
  PI_STUDIO_HOST_PI_SESSIONS_CAPABILITY,
  PI_STUDIO_HOST_WORKSPACES_CAPABILITY,
} from "@pi-studio/pi-studio/server-plugin-api";
import type {
  PiStudioHostPiSessionsV1,
  PiStudioHostWorkspacesV1,
  PluginCapability,
  ServerPluginPeer,
  PiStudioServerPlugin,
} from "@pi-studio/pi-studio/server-plugin-api";

interface FixtureDependencyV1 {
  readonly status: () => string;
}

const fixtureDependency = {
  pluginId: "fixture.provider",
  id: "status",
  version: 1,
  parse(value: unknown): FixtureDependencyV1 {
    if (!isFixtureDependency(value)) throw new Error("Fixture dependency is invalid");
    return Object.freeze({ status: () => value.status() });
  },
} satisfies PluginCapability<FixtureDependencyV1, 1>;

function isFixtureDependency(value: unknown): value is FixtureDependencyV1 {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "status") === "function";
}

const channelOnlyPeer: ServerPluginPeer = {
  openChannel: () => ({ receive: () => undefined }),
};

const plugin: PiStudioServerPlugin = {
  apiVersion: 3,
  name: "Server declaration fixture",
  requires: [
    fixtureDependency,
    PI_STUDIO_HOST_WORKSPACES_CAPABILITY,
    PI_STUDIO_HOST_PI_SESSIONS_CAPABILITY,
  ],
  activate: (context) => {
    context.notices?.record({
      severity: "info",
      message: "Server declaration fixture activated",
      scope: { projectId: "fixture-project" },
      context: { phase: "activate" },
    });
    return {
      start: async ({ capabilities, signal }) => {
        signal.throwIfAborted();
        context.logger.info(capabilities.resolve(fixtureDependency).status());
        context.logger.info(context.dataDirectory);
        const workspaces: PiStudioHostWorkspacesV1 = capabilities.resolve(PI_STUDIO_HOST_WORKSPACES_CAPABILITY);
        const authority = await workspaces.resolve({
          projectId: "fixture-project",
          workspaceId: "fixture-workspace",
        });
        context.logger.info(authority.workspace.label, { projectId: authority.project.id });
        const piSessions: PiStudioHostPiSessionsV1 = capabilities.resolve(PI_STUDIO_HOST_PI_SESSIONS_CAPABILITY);
        const run = await piSessions.run({
          projectId: authority.project.id,
          workspaceId: authority.workspace.id,
          prompt: "Inspect the current workspace",
        });
        const completion = await run.completion;
        context.logger.info(completion.status, { sessionId: run.sessionId });
      },
      peer: {
        request: ({ workspace, operation, input }) => ({ workspaceId: workspace.id, operation, input }),
      },
    };
  },
};

export { channelOnlyPeer };
export default plugin;
