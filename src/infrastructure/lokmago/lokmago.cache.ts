import { AppError } from '../../shared/errors.js';
import type { SourceSnapshot } from './lokmago.types.js';

/** No snapshot to serve and the upstream can't be reached. */
export class CatalogUnavailableError extends AppError {
  constructor(cause?: string) {
    super(
      503,
      "Katalog vaqtincha mavjud emas. Birozdan so'ng urinib ko'ring.",
      'CATALOG_UNAVAILABLE',
      cause ? { cause } : undefined
    );
  }
}

export interface CatalogLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface CatalogStoreOptions {
  /** Fetches and maps a fresh snapshot; rejects on any failure. */
  load: () => Promise<SourceSnapshot>;
  ttlMs: number;
  /**
   * After a failed refresh, serve the stale snapshot without retrying for this
   * long. Without it, every request during an outage would wait out the full
   * timeout-plus-retry against an upstream that is already down.
   */
  failureBackoffMs?: number;
  now?: () => number;
  log: CatalogLogger;
}

export interface CatalogRead {
  snapshot: SourceSnapshot;
  /** True when the upstream failed and this is the last good copy. */
  stale: boolean;
}

export interface CatalogStore {
  get(): Promise<CatalogRead>;
  /** Cache state for diagnostics. Never touches the network. */
  status(): {
    cached: boolean;
    /** Cache hits / refresh attempts since boot — visibility without a log line per request. */
    hits: number;
    misses: number;
    ageSec?: number;
    products?: number;
    skipped?: number;
    lastError?: string;
  };
  clear(): void;
}

export function createCatalogStore(opts: CatalogStoreOptions): CatalogStore {
  const { load, ttlMs, log, failureBackoffMs = 15_000, now = Date.now } = opts;

  let cached: SourceSnapshot | null = null;
  let inflight: Promise<SourceSnapshot> | null = null;
  let lastFailureAt = 0;
  let lastError: string | undefined;
  let hits = 0;
  let misses = 0;

  /** One upstream call, shared by everyone who asks while it is running. */
  function refresh(): Promise<SourceSnapshot> {
    if (!inflight) {
      const startedAt = now();
      inflight = load()
        .then((snapshot) => {
          cached = snapshot;
          lastFailureAt = 0;
          lastError = undefined;
          log.info('Catalog fetched', {
            products: snapshot.products.length,
            skipped: snapshot.skipped,
            ms: now() - startedAt,
          });
          return snapshot;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  return {
    async get() {
      const t = now();

      if (cached && t - cached.fetchedAt < ttlMs) {
        hits++;
        return { snapshot: cached, stale: false };
      }

      // Expired, but the upstream failed moments ago: don't pile on.
      if (cached && lastFailureAt && t - lastFailureAt < failureBackoffMs) {
        return { snapshot: cached, stale: true };
      }

      misses++;

      try {
        return { snapshot: await refresh(), stale: false };
      } catch (err) {
        lastFailureAt = now();
        lastError = err instanceof Error ? err.message : String(err);
        log.error('Catalog fetch failed', {
          error: lastError,
          hasStale: Boolean(cached),
        });

        if (cached) {
          log.warn('Serving stale catalog', {
            ageSec: Math.round((now() - cached.fetchedAt) / 1000),
          });
          return { snapshot: cached, stale: true };
        }
        throw new CatalogUnavailableError(lastError);
      }
    },

    status() {
      if (!cached) return { cached: false, hits, misses, ...(lastError ? { lastError } : {}) };
      return {
        cached: true,
        hits,
        misses,
        ageSec: Math.round((now() - cached.fetchedAt) / 1000),
        products: cached.products.length,
        skipped: cached.skipped,
        ...(lastError ? { lastError } : {}),
      };
    },

    clear() {
      cached = null;
      lastFailureAt = 0;
      lastError = undefined;
      hits = 0;
      misses = 0;
    },
  };
}
