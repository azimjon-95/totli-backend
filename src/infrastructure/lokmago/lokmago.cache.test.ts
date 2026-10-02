import '../../test/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogStore } from './lokmago.cache.js';
import { AppError } from '../../shared/errors.js';
import { buildCatalog, toSnapshot } from './lokmago.mapper.js';
import type { SourceSnapshot } from './lokmago.types.js';
import { lokmagoExport } from '../../test/fixtures/lokmago.js';

const silent = { info() {}, warn() {}, error() {} };

/** A controllable clock and loader. */
function harness(opts: { ttlMs?: number; failureBackoffMs?: number } = {}) {
  let time = 1_000_000;
  let calls = 0;
  let failing = false;
  let gate: Promise<void> | null = null;

  const store = createCatalogStore({
    ttlMs: opts.ttlMs ?? 60_000,
    failureBackoffMs: opts.failureBackoffMs ?? 15_000,
    now: () => time,
    log: silent,
    load: async (): Promise<SourceSnapshot> => {
      calls++;
      if (gate) await gate;
      if (failing) throw new Error('upstream down');
      return toSnapshot(buildCatalog(lokmagoExport()), time);
    },
  });

  return {
    store,
    advance: (ms: number) => void (time += ms),
    fail: (v: boolean) => void (failing = v),
    hold: () => {
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    calls: () => calls,
  };
}

describe('catalog cache', () => {
  it('loads on the first read and serves the cache within the TTL', async () => {
    const h = harness();
    const first = await h.store.get();
    h.advance(59_000);
    const second = await h.store.get();

    assert.equal(h.calls(), 1);
    assert.equal(first.stale, false);
    assert.equal(second.snapshot, first.snapshot, 'same snapshot object');
  });

  it('refetches once the TTL has passed', async () => {
    const h = harness();
    await h.store.get();
    h.advance(60_001);
    await h.store.get();
    assert.equal(h.calls(), 2);
  });

  it('shares one upstream call between concurrent readers', async () => {
    const h = harness();
    const release = h.hold();

    const reads = Promise.all(Array.from({ length: 8 }, () => h.store.get()));
    release();
    const results = await reads;

    assert.equal(h.calls(), 1);
    assert.ok(results.every((r) => r.snapshot === results[0].snapshot));
  });

  it('serves the last good copy, flagged stale, when a refresh fails', async () => {
    const h = harness();
    const good = await h.store.get();

    h.advance(61_000);
    h.fail(true);
    const result = await h.store.get();

    assert.equal(result.stale, true);
    assert.equal(result.snapshot, good.snapshot);
  });

  it('does not hammer a failing upstream: backs off, then retries', async () => {
    const h = harness({ failureBackoffMs: 15_000 });
    await h.store.get();

    h.advance(61_000);
    h.fail(true);
    await h.store.get(); // fails → 2 calls total
    assert.equal(h.calls(), 2);

    h.advance(5_000);
    for (let i = 0; i < 20; i++) await h.store.get();
    assert.equal(h.calls(), 2, 'no upstream calls inside the backoff window');

    h.advance(11_000); // past the 15s window
    await h.store.get();
    assert.equal(h.calls(), 3, 'retries after the backoff');
  });

  it('recovers: a successful refresh after failures is fresh again', async () => {
    const h = harness();
    await h.store.get();
    h.advance(61_000);
    h.fail(true);
    assert.equal((await h.store.get()).stale, true);

    h.fail(false);
    h.advance(16_000);
    const recovered = await h.store.get();
    assert.equal(recovered.stale, false);
    assert.equal(h.store.status().lastError, undefined);
  });

  it('throws a 503 CatalogUnavailableError when there is nothing cached', async () => {
    const h = harness();
    h.fail(true);

    // What the error handler reads: an AppError carrying 503 and a stable code.
    await assert.rejects(h.store.get(), (err: AppError) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, 'CATALOG_UNAVAILABLE');
      return true;
    });
  });

  it('does not serve a failed load as if it were cached', async () => {
    const h = harness();
    h.fail(true);
    await assert.rejects(h.store.get());

    h.fail(false);
    const ok = await h.store.get();
    assert.equal(ok.stale, false);
    assert.equal(h.calls(), 2);
  });

  it('reports state without touching the network', async () => {
    const h = harness();
    assert.equal(h.store.status().cached, false);

    await h.store.get();
    h.advance(10_000);
    await h.store.get();

    const status = h.store.status();
    assert.equal(status.cached, true);
    assert.equal(status.ageSec, 10);
    assert.equal(status.products, 18);
    assert.equal(status.hits, 1);
    assert.equal(status.misses, 1);
    assert.equal(h.calls(), 1);
  });

  it('clear() empties the cache', async () => {
    const h = harness();
    await h.store.get();
    h.store.clear();
    assert.equal(h.store.status().cached, false);
    await h.store.get();
    assert.equal(h.calls(), 2);
  });
});
