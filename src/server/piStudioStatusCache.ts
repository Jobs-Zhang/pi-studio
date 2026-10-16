import type { PiStudioStatusResponse } from "../shared/apiTypes.js";

const DEFAULT_PI_STUDIO_STATUS_CACHE_TTL_MS = 60_000;

export interface PiStudioStatusCacheOptions {
  ttlMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export interface PiStudioStatusCacheLoadOptions {
  force: boolean;
}

export interface PiStudioStatusCacheRefreshOptions {
  force?: boolean;
}

export interface PiStudioStatusCache {
  get(): Promise<PiStudioStatusResponse>;
  refresh(options?: PiStudioStatusCacheRefreshOptions): Promise<PiStudioStatusResponse>;
  invalidate(): void;
}

export function createPiStudioStatusCache(load: (options: PiStudioStatusCacheLoadOptions) => Promise<PiStudioStatusResponse>, options: PiStudioStatusCacheOptions = {}): PiStudioStatusCache {
  const ttlMs = options.ttlMs ?? DEFAULT_PI_STUDIO_STATUS_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  let cached: { status: PiStudioStatusResponse; expiresAt: number } | undefined;
  let pending: { promise: Promise<PiStudioStatusResponse>; force: boolean; sequence: number } | undefined;
  let loadSequence = 0;

  const refresh = (refreshOptions: PiStudioStatusCacheRefreshOptions = {}): Promise<PiStudioStatusResponse> => {
    const force = refreshOptions.force === true;
    if (pending !== undefined && (!force || pending.force)) return pending.promise;

    const sequence = ++loadSequence;
    const promise = Promise.resolve()
      .then(() => load({ force }))
      .then((status) => {
        if (sequence === loadSequence) cached = { status, expiresAt: now() + ttlMs };
        return status;
      })
      .finally(() => {
        if (pending?.sequence === sequence) pending = undefined;
      });
    pending = { promise, force, sequence };
    return promise;
  };

  return {
    async get(): Promise<PiStudioStatusResponse> {
      if (cached !== undefined) {
        if (cached.expiresAt > now()) return cached.status;
        void refresh().catch((error: unknown) => { options.onError?.(error); });
        return cached.status;
      }
      return refresh();
    },
    refresh,
    invalidate(): void {
      cached = undefined;
      loadSequence += 1;
      pending = undefined;
    },
  };
}
