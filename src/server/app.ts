import { existsSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyServerOptions } from "fastify";
import fastifyCompress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { ProjectStore } from "./storage/projectStore.js";
import { ProjectService } from "./projects/projectService.js";
import type { WorkspaceCatalog } from "./workspaces/workspaceCatalog.js";
import { SessionDaemonWorkspaceCatalog } from "./workspaces/sessionDaemonWorkspaceCatalog.js";
import { sendWorkspaceRequestError } from "./workspaces/workspaceRouteErrors.js";
import { loadEffectiveProjectAttachmentsConfig, loadEffectiveProjectUploadsConfig } from "./workspaces/projectPiStudioConfig.js";
import { listDirectorySuggestions } from "./projects/directorySuggestions.js";
import { SessionDaemonClient } from "../sessiond/sessionDaemonClient.js";
import { loadServerPluginRecoveryConfig } from "../serverPluginRecovery.js";
import { registerSessionProxyRoutes, type SessionProxyDaemon } from "./sessiond/sessionProxyRoutes.js";
import { registerWorkspaceExplorerRoutes } from "./workspaceExplorerRoutes.js";
import { registerProjectTrustRoutes } from "./projectTrustRoutes.js";
import { registerWorkspaceDeletionRoutes } from "./workspaces/workspaceDeletionRoutes.js";
import { createFilePiStudioConfigService, registerConfigRoutes, registerLocalMachineConfigRoutes, type PiStudioConfigService } from "./configRoutes.js";
import { PiStudioPluginManifestRuntimeError, PiStudioPluginService } from "./piStudioPluginService.js";
import { createActiveProfilePiPackageService, type PiPackageService } from "./piPackageService.js";
import { registerPiPackageRoutes } from "./piPackageRoutes.js";
import { createPiStudioStatusCache, type PiStudioStatusCache } from "./piStudioStatusCache.js";
import { detectPiStudioInstallation, getPiStudioRuntime, getPiStudioStatus, getPiStudioVersionStatus } from "./piStudioStatus.js";
import { createDeploymentFlavorResolver } from "./deploymentIdentity.js";
import { registerDeploymentIdentityAssetRoutes } from "./deploymentIdentityRoutes.js";
import type { PiStudioDeploymentFlavor } from "./deploymentIdentity.js";
import {
  ActiveAgentProfileAccessError,
  requireActiveAgentProfile,
  SessionDaemonActiveAgentProfileProvider,
  type ActiveAgentProfileProvider,
} from "./activeAgentProfileProvider.js";
import { MachineService } from "./machines/machineService.js";
import { registerMachineRoutes } from "./machines/machineRoutes.js";
import { registerMachineProxyRoutes } from "./machines/machineProxyRoutes.js";
import { registerPluginBackendChannelProxyRoutes } from "./plugins/pluginBackendChannelProxyRoutes.js";
import { installPluginBackendChannelWebSocketPayloadLimit } from "./webSocketBridge.js";
import { registerPairedPluginBackendProxyRoutes } from "./plugins/pluginBackendProxyRoutes.js";
import { proxyMachinePluginAsset, registerMachinePluginProxyRoutes } from "./machines/machinePluginProxyRoutes.js";
import type { Project, WorkspaceEffectiveConfig, WorkspaceProviderResolution } from "./types.js";

export interface AppDependencies {
  projects?: ProjectService;
  workspaceCatalog?: WorkspaceCatalog;
  machines?: MachineService;
  sessionDaemon?: SessionProxyDaemon;
  agentProfileProvider?: ActiveAgentProfileProvider;
  piStudioPlugins?: Pick<PiStudioPluginService, "manifest" | "plugins" | "readAsset">;
  piPackages?: PiPackageService;
  piStudioStatusCache?: PiStudioStatusCache;
  config?: PiStudioConfigService;
  clientDist?: string | false;
  /** Overrides deployment-flavor detection (dev/stable asset identity) in tests. */
  deploymentFlavor?: () => Promise<PiStudioDeploymentFlavor>;
  logger?: FastifyServerOptions["logger"];
  /** Maximum accepted HTTP request body size in bytes. */
  bodyLimit?: number;
}

interface LocalProjectRouteOptions {
  config?: Pick<PiStudioConfigService, "read">;
}

function registerLocalProjectRoutes(app: FastifyInstance, projects: ProjectService, workspaces: WorkspaceCatalog, prefix: string, options: LocalProjectRouteOptions = {}): void {
  app.get(`${prefix}/projects`, async () => projects.list());

  app.get<{ Querystring: { q?: string } }>(`${prefix}/project-directories`, async (request, reply) => {
    try {
      return await listDirectorySuggestions(request.query.q ?? "");
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get<{ Params: { projectId: string } }>(`${prefix}/projects/:projectId/workspaces`, async (request, reply) => {
    try {
      const project = await projects.requireProject(request.params.projectId);
      return await resolveWorkspacesWithEffectiveConfig(project, workspaces, options.config);
    } catch (error) {
      return sendWorkspaceRequestError(reply, error, 404);
    }
  });
}

async function resolveWorkspacesWithEffectiveConfig(
  project: Project,
  workspaces: WorkspaceCatalog,
  config?: Pick<PiStudioConfigService, "read">,
): Promise<WorkspaceProviderResolution> {
  const [resolution, effectiveConfig] = await Promise.all([
    workspaces.resolveProject(project.id),
    workspaceEffectiveConfig(project.path, config),
  ]);
  return {
    ...resolution,
    workspaces: resolution.workspaces.map((workspace) => ({ ...workspace, effectiveConfig })),
  };
}

async function workspaceEffectiveConfig(projectPath: string, config?: Pick<PiStudioConfigService, "read">): Promise<WorkspaceEffectiveConfig> {
  const globalConfig = config === undefined ? {} : (await config.read()).effectiveConfig;
  return {
    uploads: await loadEffectiveProjectUploadsConfig(projectPath, globalConfig),
    attachments: await loadEffectiveProjectAttachmentsConfig(projectPath, globalConfig),
  };
}

async function readEffectiveConfig(config: Pick<PiStudioConfigService, "read">) {
  return (await config.read()).effectiveConfig;
}

async function desiredPluginAgentDir(
  profiles: ActiveAgentProfileProvider,
  config: Pick<PiStudioConfigService, "read">,
): Promise<string> {
  try {
    return (await requireActiveAgentProfile(profiles)).dir;
  } catch (error) {
    if (!(error instanceof ActiveAgentProfileAccessError)) throw error;
    const desiredDir = (await config.read()).effectiveConfig.agent?.dir;
    if (desiredDir === undefined || desiredDir === "") throw error;
    return desiredDir;
  }
}

function invalidatePiStudioStatusOnWrite(config: PiStudioConfigService, statusCache: Pick<PiStudioStatusCache, "invalidate">): PiStudioConfigService {
  return {
    read: () => config.read(),
    write: async (nextConfig) => {
      const response = await config.write(nextConfig);
      statusCache.invalidate();
      return response;
    },
  };
}

async function withProfileDependency<T>(reply: FastifyReply, operation: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ActiveAgentProfileAccessError) return reply.code(503).send({ error: error.message });
    if (error instanceof PiStudioPluginManifestRuntimeError) {
      return reply.code(error.statusCode).send({
        error: `Required Terminal plugin runtime is ${error.runtimeStatus}`,
        code: `required-plugin-runtime-${error.runtimeStatus}`,
        detail: error.message,
      });
    }
    throw error;
  }
}

export async function buildApp(deps: AppDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? true, ...(deps.bodyLimit === undefined ? {} : { bodyLimit: deps.bodyLimit }) });
  // Vite proxies development API requests here, while production and machine-scoped
  // API requests already terminate here, so this is the shared browser HTTP edge.
  await app.register(fastifyCompress, {
    globalCompression: true,
    globalDecompression: false,
    threshold: 1024,
  });
  await app.register(fastifyWebsocket);
  installPluginBackendChannelWebSocketPayloadLimit(app.websocketServer);

  const projects = deps.projects ?? new ProjectService(new ProjectStore());
  const configService = deps.config ?? createFilePiStudioConfigService();
  const readConfig = () => readEffectiveConfig(configService);
  const sessionDaemon = deps.sessionDaemon ?? new SessionDaemonClient();
  const daemonWorkspaces = new SessionDaemonWorkspaceCatalog(sessionDaemon);
  const workspaces = deps.workspaceCatalog ?? daemonWorkspaces;
  const agentProfileProvider = deps.agentProfileProvider ?? new SessionDaemonActiveAgentProfileProvider(sessionDaemon);
  const piStudioPlugins = deps.piStudioPlugins ?? new PiStudioPluginService({
    configProvider: readConfig,
    agentDirProvider: () => desiredPluginAgentDir(agentProfileProvider, configService),
    runtimeProvider: daemonWorkspaces,
    recoveryProvider: () => loadServerPluginRecoveryConfig(),
  });
  const piPackages = deps.piPackages ?? createActiveProfilePiPackageService(agentProfileProvider);
  const piStudioStatusCache = deps.piStudioStatusCache ?? createPiStudioStatusCache(
    async ({ force }) => {
      const activeAgentProfile = await agentProfileProvider.getActiveAgentProfile();
      return getPiStudioStatus(sessionDaemon, {
        forceReleaseCheck: force,
        ...(activeAgentProfile.status === "available" ? { activeAgentProfile: activeAgentProfile.profile } : {}),
      });
    },
    { onError: (error) => { app.log.warn({ err: error }, "failed to refresh PI STUDIO status cache"); } },
  );
  const machines = deps.machines ?? new MachineService(undefined, {
    localRuntime: () => getPiStudioRuntime(sessionDaemon),
  });
  app.addHook("onClose", async () => {
    await machines.close();
  });

  app.get("/pi-studio-plugins/manifest.json", async (_request, reply) => withProfileDependency(reply, () => piStudioPlugins.manifest()));

  app.get<{ Params: { pluginId: string; "*": string } }>("/pi-studio-plugins/:pluginId/*", async (request, reply) => {
    if (await proxyMachinePluginAsset(machines, request.params.pluginId, request.params["*"], request.url, reply)) return;

    return withProfileDependency(reply, async () => {
      const asset = await piStudioPlugins.readAsset(
        request.params.pluginId,
        request.params["*"],
        new URL(request.url, "http://pi-studio.local").searchParams.get("v") ?? undefined,
      );
      if (asset === undefined) return reply.code(404).send({ error: "Plugin asset not found" });
      return reply.type(asset.contentType).send(asset.content);
    });
  });

  app.get<{ Querystring: { refresh?: string } }>("/api/pi-studio/status", async (request) => request.query.refresh === "1"
    ? piStudioStatusCache.refresh({ force: true })
    : piStudioStatusCache.get());
  app.get("/api/pi-studio/version", async () => {
    const activeAgentProfile = await agentProfileProvider.getActiveAgentProfile();
    return getPiStudioVersionStatus(sessionDaemon, activeAgentProfile.status === "available" ? { activeAgentProfile: activeAgentProfile.profile } : {});
  });
  // Web readiness must not wait for sessiond: dev Compose starts the daemon
  // only after the web-owned initial build and API startup have completed.
  app.get("/api/pi-studio/health", () => Promise.resolve({ ok: true }));
  app.get("/api/pi-studio/runtime", async () => getPiStudioRuntime(sessionDaemon));
  app.get("/api/plugins", async (_request, reply) => withProfileDependency(reply, () => piStudioPlugins.plugins()));
  app.get("/api/machines/local/plugins", async (_request, reply) => withProfileDependency(reply, () => piStudioPlugins.plugins()));
  registerPiPackageRoutes(app, piPackages);
  registerPiPackageRoutes(app, piPackages, "/api/machines/local");
  const invalidatingConfigService = invalidatePiStudioStatusOnWrite(configService, piStudioStatusCache);
  registerConfigRoutes(app, invalidatingConfigService);
  registerLocalMachineConfigRoutes(app, invalidatingConfigService);

  registerMachineRoutes(app, machines);
  registerMachinePluginProxyRoutes(app, machines);

  registerLocalProjectRoutes(app, projects, workspaces, "/api", { config: configService });
  registerLocalProjectRoutes(app, projects, workspaces, "/api/machines/local", { config: configService });

  registerSessionProxyRoutes(app, sessionDaemon);
  registerSessionProxyRoutes(app, sessionDaemon, "/api/machines/local");
  registerPairedPluginBackendProxyRoutes(app, sessionDaemon);
  registerPluginBackendChannelProxyRoutes(app, sessionDaemon);
  registerWorkspaceExplorerRoutes(app, projects, workspaces, "/api", { config: configService });
  registerWorkspaceExplorerRoutes(app, projects, workspaces, "/api/machines/local", { config: configService });
  const projectTrustDeps = {
    agentDir: async () => (await requireActiveAgentProfile(agentProfileProvider)).dir,
  };
  registerProjectTrustRoutes(app, projects, workspaces, projectTrustDeps);
  registerProjectTrustRoutes(app, projects, workspaces, projectTrustDeps, "/api/machines/local");
  registerWorkspaceDeletionRoutes(app, sessionDaemon);
  registerWorkspaceDeletionRoutes(app, sessionDaemon, "/api/machines/local");

  registerMachineProxyRoutes(app, machines);

  const packagedClientDist = join(dirname(fileURLToPath(import.meta.url)), "..", "client");
  const clientDist = deps.clientDist ?? (existsSync(packagedClientDist) ? packagedClientDist : join(process.cwd(), "dist", "client"));
  if (clientDist !== false && existsSync(clientDist)) {
    const hashedAssetsDir = join(clientDist, "assets") + sep;
    await app.register(fastifyStatic, {
      root: clientDist,
      // Vite content-hashes every file under assets/, so a URL never changes
      // meaning; let browsers skip revalidation on reload. Everything else,
      // notably index.html, keeps the default revalidating policy.
      setHeaders: (res, filePath) => {
        if (filePath.startsWith(hashedAssetsDir)) res.header("cache-control", "public, max-age=31536000, immutable");
      },
    });
    const deploymentFlavor = deps.deploymentFlavor ?? createDeploymentFlavorResolver(
      async () => {
        const activeAgentProfile = await agentProfileProvider.getActiveAgentProfile();
        return detectPiStudioInstallation(activeAgentProfile.status === "available" ? activeAgentProfile.profile.dir : undefined);
      },
      (error) => { app.log.warn({ err: error }, "failed to detect PI STUDIO deployment flavor"); },
    );
    registerDeploymentIdentityAssetRoutes(app, { clientDist, flavor: deploymentFlavor });
    app.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
  }

  return app;
}
