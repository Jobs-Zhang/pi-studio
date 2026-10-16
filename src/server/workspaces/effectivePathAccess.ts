import type { PiStudioPathAccessConfig } from "../../shared/apiTypes.js";
import type { PiStudioConfigService } from "../configRoutes.js";
import type { WorkspaceContext } from "./workspaceContext.js";
import { loadEffectiveProjectPathAccess } from "./projectPiStudioConfig.js";

export async function pathAccessForWorkspaceContext(context: WorkspaceContext, config: Pick<PiStudioConfigService, "read"> | undefined): Promise<PiStudioPathAccessConfig | undefined> {
  if (config === undefined) return undefined;
  const response = await config.read();
  return loadEffectiveProjectPathAccess(context.project.path, response.effectiveConfig);
}
