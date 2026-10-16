const DEFAULT_PI_STUDIO_RELEASE_LOOKUP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface PiStudioReleaseLookup {
  checkedAtMs: number;
  latestVersion?: string;
  error?: string;
}

export interface PiStudioReleaseLookupCacheOptions {
  ttlMs?: number;
  now?: () => number;
}

export interface PiStudioReleaseLookupOptions {
  force?: boolean;
}

export interface PiStudioReleaseLookupCache {
  get(currentVersion: string, options?: PiStudioReleaseLookupOptions): Promise<PiStudioReleaseLookup>;
}

export function createPiStudioReleaseLookupCache(
  load: (currentVersion: string) => Promise<string>,
  options: PiStudioReleaseLookupCacheOptions = {},
): PiStudioReleaseLookupCache {
  const ttlMs = options.ttlMs ?? DEFAULT_PI_STUDIO_RELEASE_LOOKUP_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  let cached: PiStudioReleaseLookup | undefined;
  let pending: { promise: Promise<PiStudioReleaseLookup>; force: boolean; sequence: number } | undefined;
  let loadSequence = 0;

  return {
    get(currentVersion: string, lookupOptions: PiStudioReleaseLookupOptions = {}): Promise<PiStudioReleaseLookup> {
      const force = lookupOptions.force === true;
      if (pending?.force === true) return pending.promise;

      const checkedAtMs = now();
      if (!force && cached !== undefined && checkedAtMs - cached.checkedAtMs < ttlMs) return Promise.resolve(cached);
      if (!force && pending !== undefined) return pending.promise;

      const sequence = ++loadSequence;
      const promise = Promise.resolve()
        .then(() => load(currentVersion))
        .then((latestVersion): PiStudioReleaseLookup => ({ checkedAtMs, latestVersion }))
        .catch((error: unknown): PiStudioReleaseLookup => ({ checkedAtMs, error: error instanceof Error ? error.message : String(error) }))
        .then((lookup) => {
          if (sequence === loadSequence) cached = lookup;
          return lookup;
        })
        .finally(() => {
          if (pending?.sequence === sequence) pending = undefined;
        });
      pending = { promise, force, sequence };
      return promise;
    },
  };
}
