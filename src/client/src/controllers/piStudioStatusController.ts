import { piStudioApi, type PiStudioStatusResponse } from "../api";
import { selectedMachineId, type GetState, type SetState } from "./types";

export interface PiStudioStatusControllerDependencies {
  api?: Pick<typeof piStudioApi, "piStudioStatus" | "checkForUpdates">;
  onRefreshError?: (machineId: string, error: unknown) => void;
}

export class PiStudioStatusController {
  private readonly api: Pick<typeof piStudioApi, "piStudioStatus" | "checkForUpdates">;
  private readonly onRefreshError: (machineId: string, error: unknown) => void;
  private requestSequence = 0;
  private pendingUpdateCheck: { machineId: string; requestSequence: number; promise: Promise<void> } | undefined;

  constructor(
    private readonly getState: GetState,
    private readonly setState: SetState,
    dependencies: PiStudioStatusControllerDependencies = {},
  ) {
    this.api = dependencies.api ?? piStudioApi;
    this.onRefreshError = dependencies.onRefreshError ?? (() => undefined);
  }

  async refresh(): Promise<void> {
    const machineId = selectedMachineId(this.getState());
    if (this.pendingUpdateCheck?.machineId === machineId) return;
    const requestSequence = ++this.requestSequence;
    try {
      const piStudioStatus = await this.api.piStudioStatus(machineId);
      if (this.isCurrent(machineId, requestSequence)) this.setState({ piStudioStatus });
    } catch (error) {
      if (!this.isCurrent(machineId, requestSequence)) return;
      this.setState({ piStudioStatus: undefined });
      this.onRefreshError(machineId, error);
    }
  }

  checkForUpdates(): Promise<void> {
    const machineId = selectedMachineId(this.getState());
    const existing = this.pendingUpdateCheck;
    if (existing?.machineId === machineId) return existing.promise;

    const requestSequence = ++this.requestSequence;
    const promise = this.api.checkForUpdates(machineId)
      .then((piStudioStatus) => {
        if (!this.isCurrent(machineId, requestSequence)) return;
        this.setState({ piStudioStatus });
        throwForUnsuccessfulReleaseCheck(piStudioStatus);
      })
      .catch((error: unknown) => {
        if (this.isCurrent(machineId, requestSequence)) throw error;
      })
      .finally(() => {
        if (this.pendingUpdateCheck?.requestSequence === requestSequence) this.pendingUpdateCheck = undefined;
      });
    this.pendingUpdateCheck = { machineId, requestSequence, promise };
    return promise;
  }

  private isCurrent(machineId: string, requestSequence: number): boolean {
    return selectedMachineId(this.getState()) === machineId && requestSequence === this.requestSequence;
  }
}

function throwForUnsuccessfulReleaseCheck(status: PiStudioStatusResponse): void {
  if (status.release.error !== undefined) throw new Error(`PI STUDIO update check failed: ${status.release.error}`);
  if (status.release.skipped === true) throw new Error("PI STUDIO update check was skipped because remote version checks are disabled by offline/version-check settings");
}
