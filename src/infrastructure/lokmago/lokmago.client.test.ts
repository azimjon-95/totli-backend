import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLokmagoExport, LokmagoHttpError } from './lokmago.client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const noSleep = async () => undefined;

/** A fetch that plays back a script of responses/errors, then fails the test if over-called. */
function scripted(steps: Array<Response | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const step = steps[calls.length - 1];
    if (!step) throw new Error('fetch called more often than scripted');
    if (step instanceof Error) throw step;
    return step;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('fetchLokmagoExport', () => {
  it('returns the parsed body on success', async () => {
    const { impl, calls } = scripted([json({ ok: true, dishes: [] })]);
    const body = await fetchLokmagoExport({ url: 'https://x/api', fetchImpl: impl, sleep: noSleep });

    assert.deepEqual(body, { ok: true, dishes: [] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://x/api');
    assert.equal(calls[0].init?.method, 'GET');
  });

  it('retries once after a 5xx and succeeds', async () => {
    const retried: number[] = [];
    const { impl, calls } = scripted([json({}, 503), json({ ok: true, dishes: [] })]);

    const body = await fetchLokmagoExport({
      url: 'u',
      fetchImpl: impl,
      sleep: noSleep,
      onRetry: (attempt) => retried.push(attempt),
    });

    assert.deepEqual(body, { ok: true, dishes: [] });
    assert.equal(calls.length, 2);
    assert.deepEqual(retried, [1]);
  });

  it('retries after a network error', async () => {
    const { impl, calls } = scripted([new TypeError('fetch failed'), json({ ok: true, dishes: [] })]);
    await fetchLokmagoExport({ url: 'u', fetchImpl: impl, sleep: noSleep });
    assert.equal(calls.length, 2);
  });

  it('gives up after the retry is spent and reports the status', async () => {
    const { impl, calls } = scripted([json({}, 502), json({}, 502)]);

    await assert.rejects(
      fetchLokmagoExport({ url: 'u', fetchImpl: impl, sleep: noSleep }),
      (err: LokmagoHttpError) => err instanceof LokmagoHttpError && err.status === 502
    );
    assert.equal(calls.length, 2, 'one attempt plus exactly one retry');
  });

  it('does not retry a 4xx — repeating a wrong request cannot help', async () => {
    const { impl, calls } = scripted([json({}, 404)]);

    await assert.rejects(
      fetchLokmagoExport({ url: 'u', fetchImpl: impl, sleep: noSleep }),
      (err: LokmagoHttpError) => err.status === 404 && err.retryable === false
    );
    assert.equal(calls.length, 1);
  });

  it('retries a 429', async () => {
    const { impl, calls } = scripted([json({}, 429), json({ ok: true, dishes: [] })]);
    await fetchLokmagoExport({ url: 'u', fetchImpl: impl, sleep: noSleep });
    assert.equal(calls.length, 2);
  });

  it('treats a non-JSON body as a retryable failure', async () => {
    const { impl, calls } = scripted([
      new Response('<html>bad gateway</html>', { status: 200 }),
      json({ ok: true, dishes: [] }),
    ]);
    await fetchLokmagoExport({ url: 'u', fetchImpl: impl, sleep: noSleep });
    assert.equal(calls.length, 2);
  });

  it('aborts a request that never answers', async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })) as unknown as typeof fetch;

    const started = Date.now();
    await assert.rejects(
      fetchLokmagoExport({ url: 'u', fetchImpl: hang, timeoutMs: 30, retries: 0 }),
      /timed out after 30ms/
    );
    assert.ok(Date.now() - started < 1000, 'must not wait on the hung upstream');
  });

  it('honours retries: 0', async () => {
    const { impl, calls } = scripted([json({}, 500)]);
    await assert.rejects(fetchLokmagoExport({ url: 'u', fetchImpl: impl, retries: 0 }));
    assert.equal(calls.length, 1);
  });
});
