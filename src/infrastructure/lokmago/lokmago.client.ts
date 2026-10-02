/** Fetching only. Parsing and mapping live in `lokmago.mapper.ts`. */

export class LokmagoHttpError extends Error {
  constructor(
    message: string,
    /** HTTP status, or undefined for network errors and timeouts. */
    public readonly status?: number,
    /** Worth another attempt? 5xx, timeouts and network errors are; 4xx is not. */
    public readonly retryable = true
  ) {
    super(message);
    this.name = 'LokmagoHttpError';
  }
}

export interface FetchCatalogOptions {
  url: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first. */
  retries?: number;
  /** Pause before a retry. */
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry — lets the caller log without this file importing a logger. */
  onRetry?: (attempt: number, error: Error) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function attemptOnce(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'totli-backend' },
      signal: controller.signal,
    });

    if (!res.ok) {
      // 4xx means our request is wrong (bad id, revoked link); repeating it won't help.
      throw new LokmagoHttpError(
        `LokmaGo responded with HTTP ${res.status}`,
        res.status,
        res.status >= 500 || res.status === 429
      );
    }

    try {
      return await res.json();
    } catch {
      throw new LokmagoHttpError('LokmaGo returned a body that is not valid JSON', res.status, true);
    }
  } catch (err) {
    if (err instanceof LokmagoHttpError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LokmagoHttpError(`LokmaGo request timed out after ${timeoutMs}ms`);
    }
    throw new LokmagoHttpError(
      `LokmaGo request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves with the parsed JSON body; rejects with `LokmagoHttpError` once attempts run out. */
export async function fetchLokmagoExport(opts: FetchCatalogOptions): Promise<unknown> {
  const {
    url,
    timeoutMs = 8_000,
    retries = 1,
    retryDelayMs = 300,
    fetchImpl = fetch,
    sleep = defaultSleep,
    onRetry,
  } = opts;

  let lastError: LokmagoHttpError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await attemptOnce(url, timeoutMs, fetchImpl);
    } catch (err) {
      lastError = err as LokmagoHttpError;
      if (!lastError.retryable || attempt === retries) break;
      onRetry?.(attempt + 1, lastError);
      await sleep(retryDelayMs);
    }
  }

  throw lastError ?? new LokmagoHttpError('LokmaGo request failed');
}
